from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import random
import string
from datetime import datetime, timezone


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

# Set of active room codes
rooms = set()


# Room host
#
# {
#     "AB12": "user-id"
# }
#
room_hosts = {}


# Active WebSocket connections
#
# {
#     "AB12": {
#         "user-id-1": websocket,
#         "user-id-2": websocket
#     }
# }
#
room_connections = {}


# All currently active strokes
#
# {
#     "AB12": [
#         stroke1,
#         stroke2
#     ]
# }
#
room_strokes = {}


# Per-user undo / redo history
#
# {
#     "AB12": {
#         "user-id": {
#             "undo": [],
#             "redo": []
#         }
#     }
# }
#
room_user_history = {}


# ============================================================
# REQUEST MODELS
# ============================================================

class RoomRequest(BaseModel):
    room_code: str


# ============================================================
# HELPERS
# ============================================================

def generate_room_code():

    characters = (
        string.ascii_uppercase +
        string.digits
    )

    return "".join(
        random.choices(
            characters,
            k=4
        )
    )


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

    room_hosts[room_code] = None

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

    room_code = (
        request.room_code
        .strip()
        .upper()
    )


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
# BROADCAST BOARD STATE
# ============================================================

async def broadcast_board_state(
    room_code
):

    if room_code not in rooms:
        return


    message = {

        "type":
            "board_state",

        "strokes":
            room_strokes[room_code]

    }


    disconnected_users = []


    for (
        user_id,
        websocket
    ) in list(
        room_connections[
            room_code
        ].items()
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
# BROADCAST TO ALL USERS
# ============================================================

async def broadcast_message(
    room_code,
    message
):

    if room_code not in rooms:
        return


    disconnected_users = []


    for (
        user_id,
        websocket
    ) in list(
        room_connections[
            room_code
        ].items()
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
# DELETE ROOM
# ============================================================

async def delete_room(
    room_code
):

    if room_code not in rooms:
        return


    print(
        f"[ROOM DELETED] {room_code}"
    )


    # --------------------------------------------------------
    # Tell all connected users that the room is gone
    # --------------------------------------------------------

    message = {

        "type":
            "room_deleted"

    }


    for (
        user_id,
        websocket
    ) in list(
        room_connections[
            room_code
        ].items()
    ):

        try:

            await websocket.send_json(
                message
            )

            await websocket.close(
                code=1000
            )

        except Exception:

            pass


    # --------------------------------------------------------
    # Delete all room data
    # --------------------------------------------------------

    room_connections.pop(
        room_code,
        None
    )

    room_strokes.pop(
        room_code,
        None
    )

    room_user_history.pop(
        room_code,
        None
    )

    room_hosts.pop(
        room_code,
        None
    )

    rooms.discard(
        room_code
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

    room_code = (
        room_code
        .strip()
        .upper()
    )


    # ========================================================
    # CHECK ROOM
    # ========================================================

    if room_code not in rooms:

        await websocket.close(
            code=1008
        )

        return


    # ========================================================
    # ACCEPT
    # ========================================================

    await websocket.accept()


    # ========================================================
    # ASSIGN HOST
    # ========================================================

    #
    # The first user who connects after room creation
    # becomes the host.
    #

    if room_hosts[room_code] is None:

        room_hosts[room_code] = user_id

        print(
            f"[HOST ASSIGNED] "
            f"room={room_code} "
            f"host={user_id}"
        )


    is_host = (
        room_hosts[room_code]
        == user_id
    )


    # ========================================================
    # REGISTER CONNECTION
    # ========================================================

    room_connections[
        room_code
    ][user_id] = websocket


    # ========================================================
    # CREATE USER HISTORY
    # ========================================================

    if user_id not in room_user_history[
        room_code
    ]:

        room_user_history[
            room_code
        ][user_id] = {

            "undo": [],

            "redo": []

        }


    print(
        f"[CONNECT] "
        f"user={user_id} "
        f"room={room_code} "
        f"host={is_host}"
    )


    print(
        f"[ROOM] {room_code} has "
        f"{len(room_connections[room_code])} "
        f"connection(s)"
    )


    # ========================================================
    # SEND INITIAL ROOM INFORMATION
    # ========================================================

    await websocket.send_json({

        "type":
            "room_info",

        "host_id":
            room_hosts[room_code],

        "is_host":
            is_host,

        "strokes":
            room_strokes[room_code]

    })


    try:

        while True:

            message = (
                await websocket.receive_json()
            )


            message_type = (
                message.get("type")
            )


            # =================================================
            # NEW STROKE
            # =================================================

            if message_type == "stroke":

                stroke = (
                    message.get("stroke")
                )


                if not stroke:
                    continue


                stroke["user_id"] = (
                    user_id
                )


                stroke["id"] = (
                    f"{user_id}-"
                    f"{random.randint(100000, 999999)}"
                )


                stroke["created_at"] = (
                    current_time()
                )


                # ---------------------------------------------
                # Store globally
                # ---------------------------------------------

                room_strokes[
                    room_code
                ].append(
                    stroke
                )


                # ---------------------------------------------
                # Store in user's history
                # ---------------------------------------------

                room_user_history[
                    room_code
                ][user_id][
                    "undo"
                ].append(
                    stroke
                )


                # New stroke clears redo

                room_user_history[
                    room_code
                ][user_id][
                    "redo"
                ].clear()


                print(
                    f"[STROKE] "
                    f"user={user_id} "
                    f"room={room_code}"
                )


                # ---------------------------------------------
                # Broadcast new stroke
                # ---------------------------------------------

                await broadcast_message(

                    room_code,

                    {

                        "type":
                            "stroke",

                        "stroke":
                            stroke

                    }

                )


            # =================================================
            # UNDO
            # =================================================

            elif message_type == "undo":

                history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                if not history["undo"]:

                    continue


                stroke = (
                    history["undo"].pop()
                )


                history["redo"].append(
                    stroke
                )


                room_strokes[
                    room_code
                ] = [

                    existing

                    for existing
                    in room_strokes[
                        room_code
                    ]

                    if existing["id"]
                    != stroke["id"]

                ]


                print(
                    f"[UNDO] "
                    f"user={user_id} "
                    f"stroke={stroke['id']}"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # REDO
            # =================================================

            elif message_type == "redo":

                history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                if not history["redo"]:

                    continue


                stroke = (
                    history["redo"].pop()
                )


                history["undo"].append(
                    stroke
                )


                room_strokes[
                    room_code
                ].append(
                    stroke
                )


                print(
                    f"[REDO] "
                    f"user={user_id} "
                    f"stroke={stroke['id']}"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # DELETE MY STROKES
            # =================================================

            elif message_type == "delete_my_strokes":

                history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                # ---------------------------------------------
                # Remove this user's strokes from board
                # ---------------------------------------------

                room_strokes[
                    room_code
                ] = [

                    stroke

                    for stroke
                    in room_strokes[
                        room_code
                    ]

                    if stroke["user_id"]
                    != user_id

                ]


                # ---------------------------------------------
                # Clear this user's history
                # ---------------------------------------------

                history["undo"].clear()

                history["redo"].clear()


                print(
                    f"[DELETE MY STROKES] "
                    f"user={user_id} "
                    f"room={room_code}"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # DELETE ALL STROKES
            # =================================================

            elif message_type == "delete_all_strokes":

                # ---------------------------------------------
                # HOST ONLY
                # ---------------------------------------------

                if room_hosts[
                    room_code
                ] != user_id:

                    print(
                        f"[DENIED] "
                        f"user={user_id} "
                        f"attempted "
                        f"delete_all_strokes"
                    )

                    await websocket.send_json({

                        "type":
                            "permission_denied",

                        "action":
                            "delete_all_strokes"

                    })

                    continue


                # ---------------------------------------------
                # Delete every stroke
                # ---------------------------------------------

                room_strokes[
                    room_code
                ].clear()


                # ---------------------------------------------
                # Clear everyone's history
                # ---------------------------------------------

                for history in (
                    room_user_history[
                        room_code
                    ].values()
                ):

                    history["undo"].clear()

                    history["redo"].clear()


                print(
                    f"[DELETE ALL STROKES] "
                    f"host={user_id} "
                    f"room={room_code}"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # DELETE ROOM
            # =================================================

            elif message_type == "delete_room":

                # ---------------------------------------------
                # HOST ONLY
                # ---------------------------------------------

                if room_hosts[
                    room_code
                ] != user_id:

                    print(
                        f"[DENIED] "
                        f"user={user_id} "
                        f"attempted "
                        f"delete_room"
                    )

                    await websocket.send_json({

                        "type":
                            "permission_denied",

                        "action":
                            "delete_room"

                    })

                    continue


                print(
                    f"[DELETE ROOM REQUEST] "
                    f"host={user_id} "
                    f"room={room_code}"
                )


                await delete_room(
                    room_code
                )


                break


    except WebSocketDisconnect:

        print(
            f"[DISCONNECT] "
            f"user={user_id} "
            f"room={room_code}"
        )


        if room_code not in room_connections:

            return


        current_connection = (
            room_connections[
                room_code
            ].get(user_id)
        )


        if (
            current_connection
            == websocket
        ):

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