import {
  useEffect,
  useRef,
  useState
} from "react";

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

              room_code:
                code

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
        onClick={
          createRoom
        }
      >
        Create Room
      </button>


      <hr />


      <input

        type="text"

        placeholder="Enter room code"

        maxLength={4}

        value={roomCode}

        onChange={
          (event) => {

            setRoomCode(
              event.target.value
                .toUpperCase()
            );

            setMessage("");

          }
        }

      />


      <button
        onClick={
          joinRoom
        }
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

  const {
    roomCode
  } = useParams();


  const navigate =
    useNavigate();


  // ==========================================================
  // USER
  // ==========================================================

  const userId =
    useRef(
      getUserId()
    );


  // ==========================================================
  // STATE
  // ==========================================================

  const [
    isHost,
    setIsHost
  ] = useState(false);


  const [
    connected,
    setConnected
  ] = useState(false);


  const [
    message,
    setMessage
  ] = useState("");


  // ----------------------------------------------------------
  // PERSONAL TOOL SETTINGS
  // ----------------------------------------------------------

  const [
    tool,
    setTool
  ] = useState("pen");


  const [
    color,
    setColor
  ] = useState("#000000");


  const [
    size,
    setSize
  ] = useState(5);


  // ==========================================================
  // REFS
  // ==========================================================

  const canvasRef =
    useRef(null);


  const websocketRef =
    useRef(null);


  const isDrawing =
    useRef(false);


  const currentStroke =
    useRef([]);


  const strokesRef =
    useRef([]);


  // ==========================================================
  // DRAW STROKE
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
      stroke.size || 5;


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
  // CANVAS SETUP
  // ==========================================================

  useEffect(() => {

    const canvas =
      canvasRef.current;


    canvas.width =
      1000;


    canvas.height =
      600;


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
    // OPEN
    // --------------------------------------------------------

    websocket.onopen = () => {

      console.log(
        `[WS CONNECTED] ${roomCode}`
      );


      setConnected(true);

    };


    // --------------------------------------------------------
    // MESSAGE
    // --------------------------------------------------------

    websocket.onmessage = (
      event
    ) => {

      const data =
        JSON.parse(
          event.data
        );


      console.log(
        "[WS RECEIVED]",
        data
      );


      // ======================================================
      // ROOM INFO
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
      // BOARD STATE
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


        setTimeout(
          () => {

            navigate("/");

          },
          1000
        );


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


        setTimeout(
          () => {

            setMessage("");

          },
          2500
        );


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
        "[WS CLOSED]",
        event.code
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
        JSON.stringify(
          message
        )
      );

    }

  };


  // ==========================================================
  // MOUSE DOWN
  // ==========================================================

  const handleMouseDown = (
    event
  ) => {

    const x =
      event.nativeEvent.offsetX;


    const y =
      event.nativeEvent.offsetY;


    // ========================================================
    // ERASER
    // ========================================================

    if (
      tool === "eraser"
    ) {

      const hitStroke =
        findOwnStrokeAtPoint(
          x,
          y
        );


      if (hitStroke) {

        sendMessage({

          type:
            "erase_stroke",

          stroke_id:
            hitStroke.id

        });

      }


      return;

    }


    // ========================================================
    // PEN
    // ========================================================

    isDrawing.current =
      true;


    currentStroke.current = [

      {
        x,
        y
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
      tool === "eraser"
    ) {

      return;

    }


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


    // --------------------------------------------------------
    // Draw locally
    // --------------------------------------------------------

    const canvas =
      canvasRef.current;


    const context =
      canvas.getContext("2d");


    context.beginPath();


    context.lineWidth =
      size;


    context.strokeStyle =
      color;


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
      tool === "eraser"
    ) {

      return;

    }


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
        color,

      size:
        size,

      tool:
        "pen"

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
  // FIND OWN STROKE
  // ==========================================================

  const findOwnStrokeAtPoint = (
    x,
    y
  ) => {

    const eraserRadius =
      Math.max(
        10,
        size * 2
      );


    // Search backwards so the visually topmost
    // stroke gets selected first.

    for (
      let i =
        strokesRef.current.length - 1;

      i >= 0;

      i--
    ) {

      const stroke =
        strokesRef.current[i];


      // ----------------------------------------------
      // Ownership
      // ----------------------------------------------

      if (
        stroke.user_id !==
        userId.current
      ) {

        continue;

      }


      // ----------------------------------------------
      // Check every segment
      // ----------------------------------------------

      const points =
        stroke.points;


      for (
        let j = 1;
        j < points.length;
        j++
      ) {

        const p1 =
          points[j - 1];


        const p2 =
          points[j];


        const distance =
          distanceToSegment(
            x,
            y,
            p1.x,
            p1.y,
            p2.x,
            p2.y
          );


        const strokeRadius =
          (stroke.size || 5)
          / 2;


        if (
          distance <=
          eraserRadius +
          strokeRadius
        ) {

          return stroke;

        }

      }

    }


    return null;

  };


  // ==========================================================
  // DISTANCE FROM POINT TO LINE SEGMENT
  // ==========================================================

  const distanceToSegment = (
    px,
    py,
    x1,
    y1,
    x2,
    y2
  ) => {

    const dx =
      x2 - x1;


    const dy =
      y2 - y1;


    if (
      dx === 0 &&
      dy === 0
    ) {

      return Math.sqrt(
        (
          px - x1
        ) ** 2 +
        (
          py - y1
        ) ** 2
      );

    }


    const t =
      Math.max(
        0,
        Math.min(
          1,
          (
            (px - x1) * dx +
            (py - y1) * dy
          ) /
          (
            dx * dx +
            dy * dy
          )
        )
      );


    const closestX =
      x1 +
      t * dx;


    const closestY =
      y1 +
      t * dy;


    return Math.sqrt(

      (
        px - closestX
      ) ** 2 +

      (
        py - closestY
      ) ** 2

    );

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
        "Delete all of your strokes?"
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
  // DELETE ALL
  // ==========================================================

  const deleteAllStrokes = () => {

    if (!isHost) {
      return;
    }


    const confirmed =
      window.confirm(
        "Delete ALL strokes for everyone?"
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
        "Delete this room permanently?"
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
  // COLOR PALETTE
  // ==========================================================

  const colors = [

    "#000000",
    "#ff0000",
    "#ff7a00",
    "#ffd000",
    "#00a000",
    "#00a8ff",
    "#0055ff",
    "#8000ff",
    "#ff00aa",
    "#ffffff"

  ];


  // ==========================================================
  // UI
  // ==========================================================

  return (

    <div
      style={{
        padding: "20px"
      }}
    >

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
          ? "🟢 Connected"
          : "🔴 Disconnected"}

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
          TOOLBAR
          ===================================================== */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          padding: "12px",
          border: "1px solid #ccc",
          marginBottom: "15px"
        }}
      >

        {/* ---------------------------------------------------
            TOOL
            --------------------------------------------------- */}

        <button

          onClick={() =>
            setTool("pen")
          }

          style={{

            fontWeight:
              tool === "pen"
                ? "bold"
                : "normal"

          }}

        >
          ✏️ Pen
        </button>


        <button

          onClick={() =>
            setTool("eraser")
          }

          style={{

            fontWeight:
              tool === "eraser"
                ? "bold"
                : "normal"

          }}

        >
          🧽 Eraser
        </button>


        {/* ---------------------------------------------------
            COLOR
            --------------------------------------------------- */}

        <span>
          Color:
        </span>


        {colors.map(
          (paletteColor) => (

            <button

              key={
                paletteColor
              }

              onClick={() => {

                setColor(
                  paletteColor
                );

                setTool("pen");

              }}

              title={
                paletteColor
              }

              style={{

                width: "25px",

                height: "25px",

                padding: 0,

                border:
                  color ===
                  paletteColor
                    ? "3px solid #333"
                    : "1px solid #999",

                backgroundColor:
                  paletteColor

              }}

            />

          )
        )}


        {/* ---------------------------------------------------
            CUSTOM COLOR
            --------------------------------------------------- */}

        <input

          type="color"

          value={color}

          onChange={
            (event) => {

              setColor(
                event.target.value
              );

              setTool("pen");

            }
          }

          title="Custom color"

        />


        {/* ---------------------------------------------------
            SIZE
            --------------------------------------------------- */}

        <span>
          Size:
        </span>


        <input

          type="range"

          min="1"

          max="30"

          value={size}

          onChange={
            (event) => {

              setSize(
                Number(
                  event.target.value
                )
              );

            }
          }

        />


        <span>
          {size}px
        </span>


        {/* ---------------------------------------------------
            UNDO / REDO
            --------------------------------------------------- */}

        <button
          onClick={
            undo
          }
        >
          ↶ Undo
        </button>


        <button
          onClick={
            redo
          }
        >
          ↷ Redo
        </button>


        {/* ---------------------------------------------------
            DELETE MY STROKES
            --------------------------------------------------- */}

        <button
          onClick={
            deleteMyStrokes
          }
        >
          🗑️ Delete My Strokes
        </button>

      </div>


      {/* =====================================================
          HOST CONTROLS
          ===================================================== */}

      {isHost && (

        <div
          style={{

            padding: "12px",

            marginBottom: "15px",

            border:
              "1px solid #cc0000"

          }}
        >

          <strong>
            👑 Host Controls
          </strong>


          <br />
          <br />


          <button
            onClick={
              deleteAllStrokes
            }
          >
            🗑️ Delete All Strokes
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
            tool === "eraser"
              ? "cell"
              : "crosshair",

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