from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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


# --------------------------------------------------
# Room storage
# --------------------------------------------------

rooms = set()

# Stores active WebSocket connections for each room
room_connections = {}


# --------------------------------------------------
# Request model
# --------------------------------------------------

class RoomRequest(BaseModel):
    room_code: str


# --------------------------------------------------
# Generate room code
# --------------------------------------------------

def generate_room_code():
    characters = string.ascii_uppercase + string.digits

    return "".join(
        random.choices(characters, k=4)
    )


# --------------------------------------------------
# Home
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "Sketchers backend is running"
    }


# --------------------------------------------------
# Create room
# --------------------------------------------------

@app.post("/create-room")
def create_room():

    while True:

        room_code = generate_room_code()

        if room_code not in rooms:
            break

    rooms.add(room_code)

    room_connections[room_code] = []

    return {
        "success": True,
        "room_code": room_code
    }


# --------------------------------------------------
# Join room
# --------------------------------------------------

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


# --------------------------------------------------
# WebSocket
# --------------------------------------------------

@app.websocket("/ws/{room_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_code: str
):

    room_code = room_code.upper()

    # Make sure room exists
    if room_code not in rooms:

        await websocket.close(
            code=1008
        )

        return

    # Accept connection
    await websocket.accept()

    # Add user to room
    room_connections[room_code].append(websocket)

    print(
        f"User connected to room {room_code}"
    )

    try:

        while True:

            # Wait for a drawing event
            message = await websocket.receive_text()

            # Send the drawing event to everyone
            # else in the same room

            for connection in room_connections[room_code]:

                if connection != websocket:

                    await connection.send_text(
                        message
                    )

    except WebSocketDisconnect:

        print(
            f"User disconnected from room {room_code}"
        )

        if websocket in room_connections[room_code]:

            room_connections[room_code].remove(
                websocket
            )