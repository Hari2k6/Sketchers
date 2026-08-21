import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams
} from "react-router-dom";


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

      const data = await response.json();

      if (data.success) {

        navigate(
          `/room/${data.room_code}`
        );

      }

    } catch (error) {

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

    } catch (error) {

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

  const { roomCode } = useParams();

  const canvasRef = useRef(null);

  const websocketRef = useRef(null);

  const isDrawing = useRef(false);

  const lastPosition = useRef({
    x: 0,
    y: 0
  });


  // ------------------------------------------------
  // Canvas setup
  // ------------------------------------------------

  useEffect(() => {

    const canvas =
      canvasRef.current;

    const context =
      canvas.getContext("2d");


    canvas.width = 1000;
    canvas.height = 600;


    context.fillStyle = "white";

    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    context.lineWidth = 3;

    context.lineCap = "round";

    context.strokeStyle = "black";


  }, []);


  // ------------------------------------------------
  // WebSocket setup
  // ------------------------------------------------

  useEffect(() => {

    const websocket =
      new WebSocket(
        `ws://localhost:8000/ws/${roomCode}`
      );


    websocketRef.current =
      websocket;


    websocket.onopen = () => {

      console.log(
        `Connected to room ${roomCode}`
      );

    };


    websocket.onmessage = (event) => {

      const data =
        JSON.parse(event.data);


      drawLine(
        data.x1,
        data.y1,
        data.x2,
        data.y2
      );

    };


    websocket.onclose = () => {

      console.log(
        "WebSocket disconnected"
      );

    };


    return () => {

      websocket.close();

    };


  }, [roomCode]);


  // ------------------------------------------------
  // Draw line on canvas
  // ------------------------------------------------

  const drawLine = (
    x1,
    y1,
    x2,
    y2
  ) => {

    const canvas =
      canvasRef.current;

    const context =
      canvas.getContext("2d");


    context.beginPath();

    context.moveTo(
      x1,
      y1
    );

    context.lineTo(
      x2,
      y2
    );

    context.stroke();

  };


  // ------------------------------------------------
  // Mouse down
  // ------------------------------------------------

  const handleMouseDown = (event) => {

    isDrawing.current = true;


    lastPosition.current = {
      x: event.nativeEvent.offsetX,
      y: event.nativeEvent.offsetY
    };

  };


  // ------------------------------------------------
  // Mouse move
  // ------------------------------------------------

  const handleMouseMove = (event) => {

    if (!isDrawing.current) {
      return;
    }


    const x =
      event.nativeEvent.offsetX;

    const y =
      event.nativeEvent.offsetY;


    const previousX =
      lastPosition.current.x;

    const previousY =
      lastPosition.current.y;


    // Draw locally
    drawLine(
      previousX,
      previousY,
      x,
      y
    );


    // Send drawing event
    // to the server

    if (
      websocketRef.current &&
      websocketRef.current.readyState === WebSocket.OPEN
    ) {

      websocketRef.current.send(
        JSON.stringify({

          x1: previousX,
          y1: previousY,

          x2: x,
          y2: y

        })
      );

    }


    lastPosition.current = {
      x,
      y
    };

  };


  // ------------------------------------------------
  // Mouse up
  // ------------------------------------------------

  const handleMouseUp = () => {

    isDrawing.current = false;

  };


  return (

    <div>

      <h1>Sketchers</h1>

      <h2>
        Room: {roomCode}
      </h2>


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