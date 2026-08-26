from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import asyncio
import os
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
# CONFIGURATION
# ============================================================

# Production:
#   600 seconds = 10 minutes
#
# Testing:
#   PowerShell:
#   $env:SKETCHERS_INACTIVITY_SECONDS="30"
#
# Then start the server.
#
# If the variable is not provided, it defaults to 600.

INACTIVITY_SECONDS = int(
    os.getenv(
        "SKETCHERS_INACTIVITY_SECONDS",
        "600"
    )
)


CHECK_INTERVAL = 5


# ============================================================
# ROOM STORAGE
# ============================================================

rooms = set()

room_hosts = {}

room_connections = {}

room_strokes = {}

room_user_history = {}

room_last_activity = {}

room_monitor_task = None


# ============================================================
# REQUEST MODEL
# ============================================================

class RoomRequest(BaseModel):
    room_code: str


# ============================================================
# TIME HELPER
# ============================================================

def current_time():

    return datetime.now(
        timezone.utc
    )


def current_time_string():

    return current_time().isoformat()


def mark_room_activity(room_code):

    if room_code in rooms:

        room_last_activity[
            room_code
        ] = current_time()


# ============================================================
# ROOM CODE
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


# ============================================================
# INACTIVITY MONITOR
# ============================================================

async def inactivity_monitor():

    print(
        f"[INACTIVITY MONITOR] "
        f"Timeout = {INACTIVITY_SECONDS} seconds"
    )


    while True:

        await asyncio.sleep(
            CHECK_INTERVAL
        )


        now = current_time()


        for room_code in list(rooms):

            last_activity = (
                room_last_activity.get(
                    room_code,
                    now
                )
            )


            inactive_seconds = (
                now - last_activity
            ).total_seconds()


            if (
                inactive_seconds
                >= INACTIVITY_SECONDS
            ):

                print(
                    f"[INACTIVITY] "
                    f"Room {room_code} "
                    f"has been inactive for "
                    f"{int(inactive_seconds)} seconds"
                )


                await delete_room(
                    room_code,
                    reason="inactivity"
                )


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
async def startup_event():

    global room_monitor_task

    room_monitor_task = asyncio.create_task(
        inactivity_monitor()
    )


# ============================================================
# SHUTDOWN
# ============================================================

@app.on_event("shutdown")
async def shutdown_event():

    global room_monitor_task

    if room_monitor_task:

        room_monitor_task.cancel()

        try:

            await room_monitor_task

        except asyncio.CancelledError:

            pass


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():

    return {
        "message": "Sketchers backend is running",
        "inactivity_timeout_seconds":
            INACTIVITY_SECONDS
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


    rooms.add(
        room_code
    )


    room_hosts[
        room_code
    ] = None


    room_connections[
        room_code
    ] = {}


    room_strokes[
        room_code
    ] = []


    room_user_history[
        room_code
    ] = {}


    room_last_activity[
        room_code
    ] = current_time()


    print(
        f"[ROOM CREATED] "
        f"{room_code}"
    )


    return {

        "success": True,

        "room_code":
            room_code

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


    # Joining counts as activity.

    mark_room_activity(
        room_code
    )


    return {

        "success": True,

        "room_code":
            room_code

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
            room_strokes[
                room_code
            ]

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
    room_code,
    reason="host"
):

    if room_code not in rooms:
        return


    print(
        f"[ROOM DELETED] "
        f"{room_code} "
        f"reason={reason}"
    )


    message = {

        "type":
            "room_deleted",

        "reason":
            reason

    }


    if room_code in room_connections:

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


    room_last_activity.pop(
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
    # ACTIVITY
    # ========================================================

    mark_room_activity(
        room_code
    )


    # ========================================================
    # ASSIGN HOST
    # ========================================================

    if room_hosts[
        room_code
    ] is None:

        room_hosts[
            room_code
        ] = user_id


        print(
            f"[HOST ASSIGNED] "
            f"room={room_code} "
            f"host={user_id}"
        )


    is_host = (
        room_hosts[
            room_code
        ] == user_id
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
            room_hosts[
                room_code
            ],

        "is_host":
            is_host,

        "strokes":
            room_strokes[
                room_code
            ]

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
            # STROKE
            # =================================================

            if message_type == "stroke":

                mark_room_activity(
                    room_code
                )


                stroke = (
                    message.get(
                        "stroke"
                    )
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
                    current_time_string()
                )


                if "color" not in stroke:

                    stroke["color"] = (
                        "#000000"
                    )


                if "size" not in stroke:

                    stroke["size"] = 5


                if "tool" not in stroke:

                    stroke["tool"] = (
                        "pen"
                    )


                if "points" not in stroke:

                    continue


                room_strokes[
                    room_code
                ].append(
                    stroke
                )


                history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                # An ordinary drawing action.

                history["undo"].append({

                    "action":
                        "add",

                    "stroke":
                        stroke

                })


                history["redo"].clear()


                print(
                    f"[STROKE] "
                    f"user={user_id} "
                    f"tool={stroke['tool']} "
                    f"color={stroke['color']} "
                    f"size={stroke['size']}"
                )


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

                mark_room_activity(
                    room_code
                )


                history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                if not history["undo"]:

                    continue


                action = (
                    history["undo"].pop()
                )


                stroke = (
                    action["stroke"]
                )


                # ---------------------------------------------
                # Undo ADD
                #
                # A normal stroke disappears.
                # ---------------------------------------------

                if action["action"] == "add":

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


                # ---------------------------------------------
                # Undo ERASE
                #
                # An erased stroke comes back.
                # ---------------------------------------------

                elif action["action"] == "erase":

                    exists = any(

                        existing["id"]
                        == stroke["id"]

                        for existing
                        in room_strokes[
                            room_code
                        ]

                    )


                    if not exists:

                        room_strokes[
                            room_code
                        ].append(
                            stroke
                        )


                # ---------------------------------------------
                # Put action into REDO
                # ---------------------------------------------

                history["redo"].append(
                    action
                )


                print(
                    f"[UNDO] "
                    f"user={user_id} "
                    f"action={action['action']} "
                    f"stroke={stroke['id']}"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # REDO
            # =================================================

            elif message_type == "redo":

                mark_room_activity(
                    room_code
                )


                history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                if not history["redo"]:

                    continue


                action = (
                    history["redo"].pop()
                )


                stroke = (
                    action["stroke"]
                )


                # ---------------------------------------------
                # Redo ADD
                #
                # Bring normal stroke back.
                # ---------------------------------------------

                if action["action"] == "add":

                    exists = any(

                        existing["id"]
                        == stroke["id"]

                        for existing
                        in room_strokes[
                            room_code
                        ]

                    )


                    if not exists:

                        room_strokes[
                            room_code
                        ].append(
                            stroke
                        )


                # ---------------------------------------------
                # Redo ERASE
                #
                # Remove erased stroke again.
                # ---------------------------------------------

                elif action["action"] == "erase":

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


                history["undo"].append(
                    action
                )


                print(
                    f"[REDO] "
                    f"user={user_id} "
                    f"action={action['action']} "
                    f"stroke={stroke['id']}"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # ERASE STROKE
            # =================================================

            elif message_type == "erase_stroke":

                mark_room_activity(
                    room_code
                )


                stroke_id = (
                    message.get(
                        "stroke_id"
                    )
                )


                if not stroke_id:

                    continue


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
                # IMPORTANT:
                # User can only erase their own stroke.
                # ------------------------------------------------

                if (
                    target_stroke["user_id"]
                    != user_id
                ):

                    print(
                        f"[ERASE DENIED] "
                        f"user={user_id} "
                        f"stroke_owner="
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
                # Remove stroke from board
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


                history = (
                    room_user_history[
                        room_code
                    ][user_id]
                )


                # ------------------------------------------------
                # IMPORTANT:
                #
                # Erasing is now an UNDOABLE ACTION.
                #
                # We DO NOT delete the history.
                # ------------------------------------------------

                history["undo"].append({

                    "action":
                        "erase",

                    "stroke":
                        target_stroke

                })


                history["redo"].clear()


                print(
                    f"[ERASE] "
                    f"user={user_id} "
                    f"stroke={stroke_id} "
                    f"(undoable)"
                )


                await broadcast_board_state(
                    room_code
                )


            # =================================================
            # DELETE MY STROKES
            # =================================================

            elif message_type == "delete_my_strokes":

                mark_room_activity(
                    room_code
                )


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


                # This is intentionally destructive.

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

                mark_room_activity(
                    room_code
                )


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

                    history[
                        "undo"
                    ].clear()

                    history[
                        "redo"
                    ].clear()


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

                mark_room_activity(
                    room_code
                )


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


                await delete_room(
                    room_code,
                    reason="host"
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