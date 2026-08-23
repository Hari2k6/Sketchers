from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
import random
import string


# ============================================================
# APP
# ============================================================

app = FastAPI(title="Sketchers API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ROOM STORAGE
# ============================================================

# Existing room codes
rooms = set()

# Active WebSocket connections
#
# {
#     "AB12": {
#         "user_id_1": websocket,
#         "user_id_2": websocket
#     }
# }
#
room_connections = {}

# Current active strokes on each board
#
# {
#     "AB12": [
#         stroke1,
#         stroke2,
#         stroke3
#     ]
# }
#
room_strokes = {}

# Per-user undo / redo history
#
# {
#     "AB12": {
#         "user_id_1": {
#             "undo": [...],
#             "redo": [...]
#         }
#     }
# }
#
room_user_history = {}


# ============================================================
# REQUEST MODEL
# ============================================================

class RoomRequest(BaseModel):
    room_code: str


# ============================================================
# ROOM CODE GENERATOR
# ============================================================

def generate_room_code():

    characters = string.ascii_uppercase + string.digits

    return "".join(
        random.choices(characters, k=4)
    )


# ============================================================
# TIME
# ============================================================

def current_time():

    return datetime.now(
        timezone.utc
    ).isoformat()


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():

    return {
        "message": "Sketchers backend is running"
    }


# ============================================================
# CREATE ROOM
# ============================================================

@app.post("/create-room")
def create_room():

    while True:

        room_code = generate_room_code()

        if room_code not in rooms:
            break

    rooms.add(room_code)

    room_connections[room_code] = {}

    room_strokes[room_code] = []

    room_user_history[room_code] = {}

    print(
        f"[ROOM CREATED] {room_code}"
    )

    return {
        "success": True,
        "room_code": room_code
    }


# ============================================================
# JOIN ROOM
# ============================================================

@app.post("/join-room")
def join_room(
    request: RoomRequest
):

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


# ============================================================
# SEND BOARD STATE
# ============================================================

async def send_board_state(
    websocket,
    room_code
):

    await websocket.send_json({
        "type": "board_state",
        "strokes": room_strokes[room_code]
    })


# ============================================================
# BROADCAST BOARD STATE
# ============================================================

async def broadcast_board_state(
    room_code
):

    message = {
        "type": "board_state",
        "strokes": room_strokes[room_code]
    }

    disconnected_users = []

    for user_id, websocket in list(
        room_connections[room_code].items()
    ):

        try:

            await websocket.send_json(
                message
            )

        except Exception:

            disconnected_users.append(
                user_id
            )


    for user_id in disconnected_users:

        room_connections[
            room_code
        ].pop(
            user_id,
            None
        )


# ============================================================
# WEBSOCKET
# ============================================================

@app.websocket(
    "/ws/{room_code}/{user_id}"
)
async def websocket_endpoint(
    websocket: WebSocket,
    room_code: str,
    user_id: str
):

    room_code = room_code.upper()

    # --------------------------------------------------------
    # Check room
    # --------------------------------------------------------

    if room_code not in rooms:

        await websocket.close(
            code=1008
        )

        return


    # --------------------------------------------------------
    # Accept WebSocket
    # --------------------------------------------------------

    await websocket.accept()


    # --------------------------------------------------------
    # Register connection
    # --------------------------------------------------------

    room_connections[
        room_code
    ][user_id] = websocket


    # --------------------------------------------------------
    # Create user history
    # --------------------------------------------------------

    if user_id not in room_user_history[room_code]:

        room_user_history[
            room_code
        ][user_id] = {

            "undo": [],

            "redo": []

        }


    print(
        f"[CONNECT] "
        f"user={user_id} "
        f"room={room_code}"
    )

    print(
        f"[ROOM] {room_code} has "
        f"{len(room_connections[room_code])} "
        f"connection(s)"
    )


    # --------------------------------------------------------
    # IMPORTANT:
    # Send existing board to newly joined user
    # --------------------------------------------------------

    await send_board_state(
        websocket,
        room_code
    )


    try:

        while True:

            message = (
                await websocket.receive_json()
            )

            message_type = message.get(
                "type"
            )


            # =================================================
            # STROKE
            # =================================================

            if message_type == "stroke":

                stroke = message.get(
                    "stroke"
                )

                if not stroke:

                    continue


                # ---------------------------------------------
                # Server owns the identity
                # ---------------------------------------------

                stroke["user_id"] = user_id

                stroke["id"] = (
                    f"{user_id}-"
                    f"{random.randint(100000, 999999)}"
                )

                stroke["created_at"] = (
                    current_time()
                )


                # ---------------------------------------------
                # Store in room
                # ---------------------------------------------

                room_strokes[
                    room_code
                ].append(
                    stroke
                )


                # ---------------------------------------------
                # Store in user's undo history
                # ---------------------------------------------

                room_user_history[
                    room_code
                ][user_id]["undo"].append(
                    stroke
                )


                # New action destroys redo history

                room_user_history[
                    room_code
                ][user_id]["redo"].clear()


                print(
                    f"[STROKE] "
                    f"user={user_id} "
                    f"room={room_code}"
                )


                # ---------------------------------------------
                # Broadcast ONLY the new stroke
                # ---------------------------------------------

                message = {

                    "type": "stroke",

                    "stroke": stroke

                }


                disconnected_users = []


                for (
                    target_user,
                    connection
                ) in list(
                    room_connections[
                        room_code
                    ].items()
                ):

                    try:

                        await connection.send_json(
                            message
                        )

                    except Exception:

                        disconnected_users.append(
                            target_user
                        )


                for target_user in disconnected_users:

                    room_connections[
                        room_code
                    ].pop(
                        target_user,
                        None
                    )


            # =================================================
            # UNDO
            # =================================================

            elif message_type == "undo":

                user_history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                # Nothing to undo

                if not user_history["undo"]:

                    print(
                        f"[UNDO IGNORED] "
                        f"user={user_id} "
                        f"nothing to undo"
                    )

                    continue


                # ---------------------------------------------
                # Take latest stroke owned by this user
                # ---------------------------------------------

                stroke = (
                    user_history["undo"].pop()
                )


                # ---------------------------------------------
                # Put it into redo
                # ---------------------------------------------

                user_history[
                    "redo"
                ].append(
                    stroke
                )


                # ---------------------------------------------
                # Remove from board
                # ---------------------------------------------

                room_strokes[
                    room_code
                ] = [

                    existing

                    for existing
                    in room_strokes[room_code]

                    if existing["id"]
                    != stroke["id"]

                ]


                print(
                    f"[UNDO] "
                    f"user={user_id} "
                    f"stroke={stroke['id']}"
                )


                # ---------------------------------------------
                # Send complete authoritative board
                # ---------------------------------------------

                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # REDO
            # =================================================

            elif message_type == "redo":

                user_history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                # Nothing to redo

                if not user_history["redo"]:

                    print(
                        f"[REDO IGNORED] "
                        f"user={user_id} "
                        f"nothing to redo"
                    )

                    continue


                # ---------------------------------------------
                # Get latest redo stroke
                # ---------------------------------------------

                stroke = (
                    user_history["redo"].pop()
                )


                # ---------------------------------------------
                # Put back on board
                # ---------------------------------------------

                room_strokes[
                    room_code
                ].append(
                    stroke
                )


                # ---------------------------------------------
                # Put back into undo
                # ---------------------------------------------

                user_history[
                    "undo"
                ].append(
                    stroke
                )


                print(
                    f"[REDO] "
                    f"user={user_id} "
                    f"stroke={stroke['id']}"
                )


                # ---------------------------------------------
                # Send authoritative board
                # ---------------------------------------------

                await broadcast_board_state(
                    room_code
                )


    except WebSocketDisconnect:

        print(
            f"[DISCONNECT] "
            f"user={user_id} "
            f"room={room_code}"
        )


        # Only remove if this exact user connection
        # still belongs to this socket

        current_connection = (
            room_connections[
                room_code
            ].get(user_id)
        )


        if current_connection == websocket:

            room_connections[
                room_code
            ].pop(
                user_id,
                None
            )


        print(
            f"[ROOM] {room_code} has "
            f"{len(room_connections[room_code])} "
            f"connection(s)"
        )