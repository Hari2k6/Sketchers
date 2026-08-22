import { useEffect, useRef, useState } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams
} from "react-router-dom";


// ==================================================
// GET / CREATE USER ID
// ==================================================

function getUserId() {

  let userId =
    sessionStorage.getItem("sketchers_user_id");


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


// ==================================================
// HOME PAGE
// ==================================================

function HomePage() {

  const [roomCode, setRoomCode] = useState("");

  const [message, setMessage] = useState("");

  const navigate = useNavigate();


  const createRoom = async () => {

    try {

      const response = await fetch(
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

    } catch {

      setMessage(
        "Could not connect to the server."
      );

    }
  };


  const joinRoom = async () => {

    const code =
      roomCode.trim().toUpperCase();


    if (code.length !== 4) {

      setMessage(
        "Enter a 4-character room code."
      );

      return;
    }


    try {

      const response = await fetch(
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

    } catch {

      setMessage(
        "Could not connect to the server."
      );

    }
  };


  return (

    <div>

      <h1>Sketchers</h1>


      <button onClick={createRoom}>
        Create Room
      </button>


      <hr />


      <input
        type="text"
        placeholder="Enter room code"
        maxLength={4}
        value={roomCode}

        onChange={(e) =>
          setRoomCode(
            e.target.value.toUpperCase()
          )
        }
      />


      <button onClick={joinRoom}>
        Join Room
      </button>


      {message && (
        <p>{message}</p>
      )}

    </div>
  );
}


// ==================================================
// WHITEBOARD
// ==================================================

function RoomPage() {

  const { roomCode } =
    useParams();


  const canvasRef =
    useRef(null);


  const websocketRef =
    useRef(null);


  const isDrawing =
    useRef(false);


  const currentStroke =
    useRef([]);


  const userId =
    useRef(getUserId());


  // ------------------------------------------------
  // Draw complete stroke
  // ------------------------------------------------

  const drawStroke = (stroke) => {

    const canvas =
      canvasRef.current;

    if (!canvas) return;


    const context =
      canvas.getContext("2d");


    const points =
      stroke.points;


    if (points.length < 2) {
      return;
    }


    context.beginPath();


    context.lineWidth =
      stroke.size;


    context.strokeStyle =
      stroke.color;


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


  // ------------------------------------------------
  // Redraw complete board
  // ------------------------------------------------

  const redrawBoard = (
    strokes
  ) => {

    const canvas =
      canvasRef.current;

    const context =
      canvas.getContext("2d");


    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    context.fillStyle =
      "white";


    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    for (
      const stroke of strokes
    ) {

      drawStroke(stroke);

    }
  };


  // ------------------------------------------------
  // Canvas setup
  // ------------------------------------------------

  useEffect(() => {

    const canvas =
      canvasRef.current;


    canvas.width = 1000;

    canvas.height = 600;


    const context =
      canvas.getContext("2d");


    context.fillStyle =
      "white";


    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

  }, []);


  // ------------------------------------------------
  // WebSocket
  // ------------------------------------------------

  useEffect(() => {

    const websocket =
      new WebSocket(
        `ws://localhost:8000/ws/${roomCode}/${userId.current}`
      );


    websocketRef.current =
      websocket;


    websocket.onopen = () => {

      console.log(
        `[WS CONNECTED] room=${roomCode} user=${userId.current}`
      );

    };


    websocket.onmessage = (event) => {

      console.log(
        "[WS RECEIVED]",
        event.data
      );

      const data =
        JSON.parse(event.data);


      if (
        data.type === "history" ||
        data.type === "stroke"
      ) {

        drawStroke(
          data.stroke
        );

      }

    };


    websocket.onerror = (error) => {

      console.error(
        "[WS ERROR]",
        error
      );

    };


    websocket.onclose = (event) => {

      console.log(
        `[WS CLOSED] code=${event.code}`
      );

    };


    return () => {

      websocket.close();

    };

  }, [roomCode]);


  // ------------------------------------------------
  // Mouse down
  // ------------------------------------------------

  const handleMouseDown = (
    event
  ) => {

    isDrawing.current =
      true;


    currentStroke.current = [

      {
        x: event.nativeEvent.offsetX,
        y: event.nativeEvent.offsetY
      }

    ];

  };


  // ------------------------------------------------
  // Mouse move
  // ------------------------------------------------

  const handleMouseMove = (
    event
  ) => {

    if (
      !isDrawing.current
    ) {

      return;

    }


    const point = {

      x: event.nativeEvent.offsetX,

      y: event.nativeEvent.offsetY

    };


    const points =
      currentStroke.current;


    const previous =
      points[points.length - 1];


    points.push(point);


    const canvas =
      canvasRef.current;

    const context =
      canvas.getContext("2d");


    context.beginPath();


    context.lineWidth = 3;

    context.lineCap =
      "round";

    context.strokeStyle =
      "black";


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


  // ------------------------------------------------
  // Mouse up
  // ------------------------------------------------

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

      color: "#000000",

      size: 3

    };


    // Send complete stroke

    if (
      websocketRef.current &&
      websocketRef.current.readyState ===
        WebSocket.OPEN
    ) {

      const message = JSON.stringify({
        type: "stroke",
        stroke: stroke
      });

      console.log(
        "[WS SEND]",
        message
      );

      websocketRef.current.send(message);

    }


    currentStroke.current =
      [];

  };


  return (

    <div>

      <h1>Sketchers</h1>


      <h2>
        Room: {roomCode}
      </h2>


      <p>
        User: {userId.current}
      </p>


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
          border: "2px solid black",

          cursor: "crosshair"
        }}

      />

    </div>

  );
}


// ==================================================
// APP
// ==================================================

function App() {

  return (

    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={<HomePage />}
        />


        <Route
          path="/room/:roomCode"
          element={<RoomPage />}
        />

      </Routes>

    </BrowserRouter>

  );
}


export default App;