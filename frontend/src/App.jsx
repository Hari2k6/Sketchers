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


  // ----------------------------------------------------------
  // CREATE ROOM
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // JOIN ROOM
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // UI
  // ----------------------------------------------------------

  return (

    <div>

      <h1>Sketchers</h1>


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


  // ----------------------------------------------------------
  // References
  // ----------------------------------------------------------

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


  // IMPORTANT:
  // This is the client's copy of the authoritative
  // server-side board.

  const strokesRef =
    useRef([]);


  // ----------------------------------------------------------
  // Draw ONE stroke
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // Redraw entire board
  // ----------------------------------------------------------

  const redrawBoard = () => {

    const canvas =
      canvasRef.current;


    if (!canvas) {

      return;

    }


    const context =
      canvas.getContext("2d");


    // Clear

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    // White background

    context.fillStyle =
      "#ffffff";


    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    // Replay all active strokes

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

    console.log(
      `[WS CONNECTING] room=${roomCode} user=${userId.current}`
    );


    const websocket =
      new WebSocket(
        `ws://localhost:8000/ws/${roomCode}/${userId.current}`
      );


    websocketRef.current =
      websocket;


    // --------------------------------------------------------
    // OPEN
    // --------------------------------------------------------

    websocket.onopen = () => {

      console.log(
        `[WS CONNECTED] room=${roomCode} user=${userId.current}`
      );

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

    };


    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------

    return () => {

      websocket.close();

    };

  }, [roomCode]);


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


    // Draw locally immediately

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


    // Need at least two points

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


    // --------------------------------------------------------
    // Send to server
    // --------------------------------------------------------

    if (
      websocketRef.current &&
      websocketRef.current.readyState ===
        WebSocket.OPEN
    ) {

      const message =
        JSON.stringify({

          type:
            "stroke",

          stroke:
            stroke

        });


      console.log(
        "[WS SEND]",
        message
      );


      websocketRef.current.send(
        message
      );

    }


    currentStroke.current =
      [];

  };


  // ==========================================================
  // UNDO
  // ==========================================================

  const undo = () => {

    if (
      websocketRef.current &&
      websocketRef.current.readyState ===
        WebSocket.OPEN
    ) {

      console.log(
        "[UNDO SEND]"
      );


      websocketRef.current.send(
        JSON.stringify({

          type:
            "undo"

        })
      );

    }

  };


  // ==========================================================
  // REDO
  // ==========================================================

  const redo = () => {

    if (
      websocketRef.current &&
      websocketRef.current.readyState ===
        WebSocket.OPEN
    ) {

      console.log(
        "[REDO SEND]"
      );


      websocketRef.current.send(
        JSON.stringify({

          type:
            "redo"

        })
      );

    }

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


      <div>

        <button
          onClick={undo}
        >
          Undo
        </button>


        <button
          onClick={redo}
        >
          Redo
        </button>

      </div>


      <br />


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
            "block"

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