import { useEffect, useRef, useState } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams
} from "react-router-dom";


// ============================================================
// USER ID
// ============================================================

function getUserId() {

  let userId =
    sessionStorage.getItem(
      "sketchers_user_id"
    );


  if (!userId) {

    userId =
      crypto.randomUUID();

    sessionStorage.setItem(
      "sketchers_user_id",
      userId
    );

  }


  return userId;
}


// ============================================================
// HOME PAGE
// ============================================================

function HomePage() {

  const [roomCode, setRoomCode] =
    useState("");

  const [message, setMessage] =
    useState("");

  const navigate =
    useNavigate();


  // ==========================================================
  // CREATE ROOM
  // ==========================================================

  const createRoom = async () => {

    try {

      const response =
        await fetch(
          "http://localhost:8000/create-room",
          {
            method: "POST"
          }
        );


      const data =
        await response.json();


      if (data.success) {

        navigate(
          `/room/${data.room_code}`
        );

      }

    }

    catch (error) {

      console.error(error);

      setMessage(
        "Could not connect to the server."
      );

    }

  };


  // ==========================================================
  // JOIN ROOM
  // ==========================================================

  const joinRoom = async () => {

    const code =
      roomCode
        .trim()
        .toUpperCase();


    if (code.length !== 4) {

      setMessage(
        "Enter a 4-character room code."
      );

      return;

    }


    try {

      const response =
        await fetch(
          "http://localhost:8000/join-room",
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json"

            },

            body: JSON.stringify({

              room_code: code

            })

          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        setMessage(
          data.detail
        );

        return;

      }


      navigate(
        `/room/${data.room_code}`
      );

    }

    catch (error) {

      console.error(error);

      setMessage(
        "Could not connect to the server."
      );

    }

  };


  return (

    <div>

      <h1>
        Sketchers
      </h1>


      <button
        onClick={createRoom}
      >
        Create Room
      </button>


      <hr />


      <input

        type="text"

        placeholder="Enter room code"

        maxLength={4}

        value={roomCode}

        onChange={(event) => {

          setRoomCode(
            event.target.value
              .toUpperCase()
          );

          setMessage("");

        }}

      />


      <button
        onClick={joinRoom}
      >
        Join Room
      </button>


      {message && (

        <p>
          {message}
        </p>

      )}

    </div>

  );

}


// ============================================================
// ROOM PAGE
// ============================================================

function RoomPage() {

  const { roomCode } =
    useParams();


  const navigate =
    useNavigate();


  // ==========================================================
  // STATE
  // ==========================================================

  const [isHost, setIsHost] =
    useState(false);

  const [connected, setConnected] =
    useState(false);

  const [message, setMessage] =
    useState("");


  // ==========================================================
  // REFS
  // ==========================================================

  const canvasRef =
    useRef(null);

  const websocketRef =
    useRef(null);

  const userId =
    useRef(getUserId());

  const isDrawing =
    useRef(false);

  const currentStroke =
    useRef([]);

  const strokesRef =
    useRef([]);


  // ==========================================================
  // DRAW ONE STROKE
  // ==========================================================

  const drawStroke = (
    context,
    stroke
  ) => {

    if (
      !stroke ||
      !stroke.points ||
      stroke.points.length < 2
    ) {

      return;

    }


    const points =
      stroke.points;


    context.beginPath();


    context.lineWidth =
      stroke.size || 3;


    context.strokeStyle =
      stroke.color || "#000000";


    context.lineCap =
      "round";


    context.lineJoin =
      "round";


    context.moveTo(
      points[0].x,
      points[0].y
    );


    for (
      let i = 1;
      i < points.length;
      i++
    ) {

      context.lineTo(
        points[i].x,
        points[i].y
      );

    }


    context.stroke();

  };


  // ==========================================================
  // REDRAW BOARD
  // ==========================================================

  const redrawBoard = () => {

    const canvas =
      canvasRef.current;


    if (!canvas) {
      return;
    }


    const context =
      canvas.getContext("2d");


    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    context.fillStyle =
      "#ffffff";


    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    for (
      const stroke
      of strokesRef.current
    ) {

      drawStroke(
        context,
        stroke
      );

    }

  };


  // ==========================================================
  // CANVAS INITIALIZATION
  // ==========================================================

  useEffect(() => {

    const canvas =
      canvasRef.current;


    canvas.width = 1000;

    canvas.height = 600;


    redrawBoard();

  }, []);


  // ==========================================================
  // WEBSOCKET
  // ==========================================================

  useEffect(() => {

    const websocket =
      new WebSocket(
        `ws://localhost:8000/ws/${roomCode}/${userId.current}`
      );


    websocketRef.current =
      websocket;


    // --------------------------------------------------------
    // CONNECTED
    // --------------------------------------------------------

    websocket.onopen = () => {

      console.log(
        `[WS CONNECTED] room=${roomCode}`
      );

      setConnected(true);

    };


    // --------------------------------------------------------
    // MESSAGE
    // --------------------------------------------------------

    websocket.onmessage = (
      event
    ) => {

      console.log(
        "[WS RECEIVED]",
        event.data
      );


      const data =
        JSON.parse(event.data);


      // ======================================================
      // ROOM INFORMATION
      // ======================================================

      if (
        data.type === "room_info"
      ) {

        setIsHost(
          data.is_host
        );


        strokesRef.current =
          data.strokes || [];


        redrawBoard();


        if (data.is_host) {

          console.log(
            "[HOST] This user is the room host."
          );

        }


        return;

      }


      // ======================================================
      // NEW STROKE
      // ======================================================

      if (
        data.type === "stroke"
      ) {

        strokesRef.current.push(
          data.stroke
        );


        redrawBoard();

        return;

      }


      // ======================================================
      // COMPLETE BOARD STATE
      // ======================================================

      if (
        data.type === "board_state"
      ) {

        strokesRef.current =
          data.strokes || [];


        redrawBoard();

        return;

      }


      // ======================================================
      // ROOM DELETED
      // ======================================================

      if (
        data.type === "room_deleted"
      ) {

        setMessage(
          "The host deleted this room."
        );


        setTimeout(() => {

          navigate("/");

        }, 1200);


        return;

      }


      // ======================================================
      // PERMISSION DENIED
      // ======================================================

      if (
        data.type ===
        "permission_denied"
      ) {

        setMessage(
          "You do not have permission to perform that action."
        );


        setTimeout(() => {

          setMessage("");

        }, 2500);


        return;

      }

    };


    // --------------------------------------------------------
    // ERROR
    // --------------------------------------------------------

    websocket.onerror = (
      error
    ) => {

      console.error(
        "[WS ERROR]",
        error
      );

      setConnected(false);

    };


    // --------------------------------------------------------
    // CLOSE
    // --------------------------------------------------------

    websocket.onclose = (
      event
    ) => {

      console.log(
        `[WS CLOSED] code=${event.code}`
      );

      setConnected(false);

    };


    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------

    return () => {

      websocket.close();

    };

  }, [roomCode]);


  // ==========================================================
  // SEND MESSAGE
  // ==========================================================

  const sendMessage = (
    message
  ) => {

    if (
      websocketRef.current &&
      websocketRef.current.readyState ===
        WebSocket.OPEN
    ) {

      websocketRef.current.send(
        JSON.stringify(message)
      );

    }

  };


  // ==========================================================
  // MOUSE DOWN
  // ==========================================================

  const handleMouseDown = (
    event
  ) => {

    isDrawing.current =
      true;


    currentStroke.current = [

      {

        x:
          event.nativeEvent.offsetX,

        y:
          event.nativeEvent.offsetY

      }

    ];

  };


  // ==========================================================
  // MOUSE MOVE
  // ==========================================================

  const handleMouseMove = (
    event
  ) => {

    if (
      !isDrawing.current
    ) {

      return;

    }


    const point = {

      x:
        event.nativeEvent.offsetX,

      y:
        event.nativeEvent.offsetY

    };


    const points =
      currentStroke.current;


    const previous =
      points[
        points.length - 1
      ];


    points.push(
      point
    );


    const canvas =
      canvasRef.current;


    const context =
      canvas.getContext("2d");


    context.beginPath();


    context.lineWidth =
      3;


    context.strokeStyle =
      "#000000";


    context.lineCap =
      "round";


    context.lineJoin =
      "round";


    context.moveTo(
      previous.x,
      previous.y
    );


    context.lineTo(
      point.x,
      point.y
    );


    context.stroke();

  };


  // ==========================================================
  // MOUSE UP
  // ==========================================================

  const handleMouseUp = () => {

    if (
      !isDrawing.current
    ) {

      return;

    }


    isDrawing.current =
      false;


    if (
      currentStroke.current.length < 2
    ) {

      currentStroke.current =
        [];

      return;

    }


    const stroke = {

      points:
        currentStroke.current,

      color:
        "#000000",

      size:
        3

    };


    sendMessage({

      type:
        "stroke",

      stroke:
        stroke

    });


    currentStroke.current =
      [];

  };


  // ==========================================================
  // UNDO
  // ==========================================================

  const undo = () => {

    sendMessage({

      type:
        "undo"

    });

  };


  // ==========================================================
  // REDO
  // ==========================================================

  const redo = () => {

    sendMessage({

      type:
        "redo"

    });

  };


  // ==========================================================
  // DELETE MY STROKES
  // ==========================================================

  const deleteMyStrokes = () => {

    const confirmed =
      window.confirm(
        "Delete all of your strokes from this room?"
      );


    if (!confirmed) {
      return;
    }


    sendMessage({

      type:
        "delete_my_strokes"

    });

  };


  // ==========================================================
  // DELETE ALL STROKES
  // ==========================================================

  const deleteAllStrokes = () => {

    if (!isHost) {
      return;
    }


    const confirmed =
      window.confirm(
        "Delete ALL strokes from this room for everyone?"
      );


    if (!confirmed) {
      return;
    }


    sendMessage({

      type:
        "delete_all_strokes"

    });

  };


  // ==========================================================
  // DELETE ROOM
  // ==========================================================

  const deleteRoom = () => {

    if (!isHost) {
      return;
    }


    const confirmed =
      window.confirm(
        "Delete this room permanently? Everyone will be removed and all strokes will be lost."
      );


    if (!confirmed) {
      return;
    }


    sendMessage({

      type:
        "delete_room"

    });

  };


  // ==========================================================
  // UI
  // ==========================================================

  return (

    <div>

      <h1>
        Sketchers
      </h1>


      <h2>
        Room: {roomCode}
      </h2>


      <p>
        User ID: {userId.current}
      </p>


      <p>

        Status:{" "}

        {connected
          ? "Connected"
          : "Disconnected"}

      </p>


      {isHost && (

        <p>
          👑 You are the room host
        </p>

      )}


      {message && (

        <p>
          {message}
        </p>

      )}


      {/* =====================================================
          NORMAL USER CONTROLS
          ===================================================== */}

      <div>

        <button
          onClick={undo}
        >
          ↶ Undo
        </button>


        <button
          onClick={redo}
        >
          ↷ Redo
        </button>


        <button
          onClick={
            deleteMyStrokes
          }
        >
          🗑 Delete My Strokes
        </button>

      </div>


      {/* =====================================================
          HOST CONTROLS
          ===================================================== */}

      {isHost && (

        <div
          style={{
            marginTop: "15px",
            padding: "10px",
            border: "1px solid #999"
          }}
        >

          <strong>
            Host Controls
          </strong>


          <br />
          <br />


          <button
            onClick={
              deleteAllStrokes
            }
          >
            🗑 Delete All Strokes
          </button>


          <button
            onClick={
              deleteRoom
            }
            style={{
              marginLeft: "10px"
            }}
          >
            🚪 Delete Room
          </button>

        </div>

      )}


      <br />


      {/* =====================================================
          CANVAS
          ===================================================== */}

      <canvas

        ref={canvasRef}

        onMouseDown={
          handleMouseDown
        }

        onMouseMove={
          handleMouseMove
        }

        onMouseUp={
          handleMouseUp
        }

        onMouseLeave={
          handleMouseUp
        }

        style={{

          border:
            "2px solid black",

          cursor:
            "crosshair",

          display:
            "block",

          background:
            "white"

        }}

      />

    </div>

  );

}


// ============================================================
// APP
// ============================================================

function App() {

  return (

    <BrowserRouter>

      <Routes>

        <Route

          path="/"

          element={
            <HomePage />
          }

        />


        <Route

          path="/room/:roomCode"

          element={
            <RoomPage />
          }

        />

      </Routes>

    </BrowserRouter>

  );

}


export default App;