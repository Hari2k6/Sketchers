from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
import random
import string


app = FastAPI(title="Sketchers API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# ROOM STORAGE
# ==================================================

rooms = set()

room_connections = {}

room_strokes = {}

room_user_history = {}


# ==================================================
# REQUEST MODEL
# ==================================================

class RoomRequest(BaseModel):
    room_code: str


# ==================================================
# ROOM CODE
# ==================================================

def generate_room_code():

    characters = string.ascii_uppercase + string.digits

    return "".join(
        random.choices(characters, k=4)
    )


# ==================================================
# TIME
# ==================================================

def current_time():

    return datetime.now(timezone.utc).isoformat()


# ==================================================
# HOME
# ==================================================

@app.get("/")
def home():

    return {
        "message": "Sketchers backend is running"
    }


# ==================================================
# CREATE ROOM
# ==================================================

@app.post("/create-room")
def create_room():

    while True:

        room_code = generate_room_code()

        if room_code not in rooms:
            break

    rooms.add(room_code)

    room_connections[room_code] = []

    room_strokes[room_code] = []

    room_user_history[room_code] = {}

    return {
        "success": True,
        "room_code": room_code
    }


# ==================================================
# JOIN ROOM
# ==================================================

@app.post("/join-room")
def join_room(request: RoomRequest):

    room_code = request.room_code.upper()

    if room_code not in rooms:

        raise HTTPException(
            status_code=404,
            detail="Room does not exist"
        )

    return {
        "success": True,
        "room_code": room_code
    }


# ==================================================
# WEBSOCKET
# ==================================================

@app.websocket("/ws/{room_code}/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_code: str,
    user_id: str
):

    room_code = room_code.upper()

    if room_code not in rooms:
        await websocket.close(code=1008)
        return

    await websocket.accept()

    # ----------------------------------------------
    # Register this connection
    # ----------------------------------------------

    room_connections[room_code].append(websocket)

    # ----------------------------------------------
    # Create user history if necessary
    # ----------------------------------------------

    if user_id not in room_user_history[room_code]:

        room_user_history[room_code][user_id] = {
            "undo": [],
            "redo": []
        }

    print(
        f"[CONNECT] user={user_id} room={room_code}"
    )

    print(
        f"[ROOM] {room_code} has "
        f"{len(room_connections[room_code])} connection(s)"
    )

    # ----------------------------------------------
    # SEND EXISTING STROKES TO NEW USER
    # ----------------------------------------------

    for stroke in room_strokes[room_code]:

        await websocket.send_json({
            "type": "history",
            "stroke": stroke
        })

    try:

        while True:

            message = await websocket.receive_json()

            message_type = message.get("type")

            # ======================================
            # NEW STROKE
            # ======================================

            if message_type == "stroke":

                stroke = message["stroke"]

                stroke["user_id"] = user_id
                stroke["created_at"] = current_time()

                # Store globally in room
                room_strokes[room_code].append(stroke)

                # Store in this user's history
                room_user_history[
                    room_code
                ][user_id]["undo"].append(stroke)

                # New stroke clears this user's redo
                room_user_history[
                    room_code
                ][user_id]["redo"].clear()

                print(
                    f"[STROKE] user={user_id} "
                    f"room={room_code}"
                )

                # ----------------------------------
                # BROADCAST TO EVERY OTHER CONNECTION
                # ----------------------------------

                dead_connections = []

                for connection in room_connections[room_code]:

                    if connection == websocket:
                        continue

                    try:

                        await connection.send_json({
                            "type": "stroke",
                            "stroke": stroke
                        })

                    except Exception:

                        dead_connections.append(connection)


                # Remove dead connections
                for connection in dead_connections:

                    if connection in room_connections[room_code]:

                        room_connections[
                            room_code
                        ].remove(connection)


            # ======================================
            # DISCONNECT
            # ======================================

    except WebSocketDisconnect:

        print(
            f"[DISCONNECT] user={user_id} "
            f"room={room_code}"
        )

        if websocket in room_connections[room_code]:

            room_connections[
                room_code
            ].remove(websocket)


        print(
            f"[ROOM] {room_code} has "
            f"{len(room_connections[room_code])} "
            f"connection(s)"
        )