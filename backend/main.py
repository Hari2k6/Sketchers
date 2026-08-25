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

rooms = set()

room_hosts = {}

room_connections = {}

room_strokes = {}

room_user_history = {}


# ============================================================
# REQUEST MODEL
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
# BROADCAST MESSAGE
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
    # ACCEPT CONNECTION
    # ========================================================

    await websocket.accept()


    # ========================================================
    # ASSIGN HOST
    # ========================================================

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
    # USER HISTORY
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
    # INITIAL ROOM STATE
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


                # ------------------------------------------------
                # Server assigns ownership
                # ------------------------------------------------

                stroke["user_id"] = user_id


                stroke["id"] = (
                    f"{user_id}-"
                    f"{random.randint(100000, 999999)}"
                )


                stroke["created_at"] = (
                    current_time()
                )


                # ------------------------------------------------
                # Basic validation/defaults
                # ------------------------------------------------

                if "color" not in stroke:
                    stroke["color"] = "#000000"


                if "size" not in stroke:
                    stroke["size"] = 3


                if "tool" not in stroke:
                    stroke["tool"] = "pen"


                if "points" not in stroke:
                    continue


                # ------------------------------------------------
                # Store stroke
                # ------------------------------------------------

                room_strokes[
                    room_code
                ].append(
                    stroke
                )


                # ------------------------------------------------
                # User history
                # ------------------------------------------------

                room_user_history[
                    room_code
                ][user_id][
                    "undo"
                ].append(
                    stroke
                )


                room_user_history[
                    room_code
                ][user_id][
                    "redo"
                ].clear()


                print(
                    f"[STROKE] "
                    f"user={user_id} "
                    f"tool={stroke['tool']} "
                    f"color={stroke['color']} "
                    f"size={stroke['size']}"
                )


                # ------------------------------------------------
                # Broadcast
                # ------------------------------------------------

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
            # ERASE STROKE
            # =================================================

            elif message_type == "erase_stroke":

                stroke_id = (
                    message.get(
                        "stroke_id"
                    )
                )


                if not stroke_id:
                    continue


                # ------------------------------------------------
                # Find stroke
                # ------------------------------------------------

                target_stroke = None


                for stroke in room_strokes[
                    room_code
                ]:

                    if stroke["id"] == stroke_id:

                        target_stroke = stroke

                        break


                if target_stroke is None:
                    continue


                # ------------------------------------------------
                # OWNERSHIP CHECK
                # ------------------------------------------------

                if (
                    target_stroke["user_id"]
                    != user_id
                ):

                    print(
                        f"[ERASE DENIED] "
                        f"user={user_id} "
                        f"attempted to erase "
                        f"stroke belonging to "
                        f"{target_stroke['user_id']}"
                    )


                    await websocket.send_json({

                        "type":
                            "permission_denied",

                        "action":
                            "erase_stroke"

                    })


                    continue


                # ------------------------------------------------
                # Remove from board
                # ------------------------------------------------

                room_strokes[
                    room_code
                ] = [

                    stroke

                    for stroke
                    in room_strokes[
                        room_code
                    ]

                    if stroke["id"]
                    != stroke_id

                ]


                # ------------------------------------------------
                # Remove from user's undo history
                #
                # The erased stroke should no longer be
                # resurrected by Undo.
                # ------------------------------------------------

                history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                history["undo"] = [

                    stroke

                    for stroke
                    in history["undo"]

                    if stroke["id"]
                    != stroke_id

                ]


                history["redo"] = [

                    stroke

                    for stroke
                    in history["redo"]

                    if stroke["id"]
                    != stroke_id

                ]


                print(
                    f"[ERASE] "
                    f"user={user_id} "
                    f"stroke={stroke_id}"
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


                history["undo"].clear()

                history["redo"].clear()


                print(
                    f"[DELETE MY STROKES] "
                    f"user={user_id}"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # DELETE ALL STROKES
            # =================================================

            elif message_type == "delete_all_strokes":

                if room_hosts[
                    room_code
                ] != user_id:

                    await websocket.send_json({

                        "type":
                            "permission_denied",

                        "action":
                            "delete_all_strokes"

                    })

                    continue


                room_strokes[
                    room_code
                ].clear()


                for history in (
                    room_user_history[
                        room_code
                    ].values()
                ):

                    history["undo"].clear()

                    history["redo"].clear()


                print(
                    f"[DELETE ALL STROKES] "
                    f"host={user_id}"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # DELETE ROOM
            # =================================================

            elif message_type == "delete_room":

                if room_hosts[
                    room_code
                ] != user_id:

                    await websocket.send_json({

                        "type":
                            "permission_denied",

                        "action":
                            "delete_room"

                    })

                    continue


                print(
                    f"[DELETE ROOM] "
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