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

import "./App.css";


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

    } catch (error) {

      console.error(error);

      setMessage(
        "Could not connect to Sketchers server."
      );
    }
  };


  const joinRoom = async () => {

    const code =
      roomCode
        .trim()
        .toUpperCase();


    if (code.length !== 4) {

      setMessage(
        "Enter a valid 4-character room code."
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
          data.detail ||
          "Room does not exist."
        );

        return;
      }


      navigate(
        `/room/${data.room_code}`
      );

    } catch (error) {

      console.error(error);

      setMessage(
        "Could not connect to Sketchers server."
      );
    }
  };


  return (

    <div className="home-page">

      <div className="home-card">

        <div className="logo-mark">
          ✦
        </div>

        <h1>
          Sketchers
        </h1>

        <p className="home-subtitle">
          Draw together. Create together.
        </p>


        <button
          className="primary-button create-button"
          onClick={createRoom}
        >
          <span>＋</span>
          Create Room
        </button>


        <div className="divider">
          <span>or</span>
        </div>


        <div className="join-section">

          <input
            className="room-input"
            type="text"
            placeholder="ROOM CODE"
            maxLength={4}
            value={roomCode}
            onChange={(event) => {

              setRoomCode(
                event.target.value
                  .toUpperCase()
                  .replace(
                    /[^A-Z0-9]/g,
                    ""
                  )
              );

              setMessage("");
            }}
            onKeyDown={(event) => {

              if (
                event.key === "Enter"
              ) {

                joinRoom();

              }

            }}
          />


          <button
            className="secondary-button"
            onClick={joinRoom}
          >
            Join Room
          </button>

        </div>


        {message && (

          <div className="error-message">
            {message}
          </div>

        )}

      </div>

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


  const userId =
    useRef(
      getUserId()
    );


  const [isHost, setIsHost] =
    useState(false);


  const [connected, setConnected] =
    useState(false);


  const [message, setMessage] =
    useState("");


  const [tool, setTool] =
    useState("pen");


  const [color, setColor] =
    useState("#171717");


  const [size, setSize] =
    useState(5);


  const [showHostMenu, setShowHostMenu] =
    useState(false);


  const canvasRef =
    useRef(null);


  const websocketRef =
    useRef(null);


  const strokesRef =
    useRef([]);


  const isDrawing =
    useRef(false);


  const currentStroke =
    useRef([]);


  // ==========================================================
  // COLORS
  // ==========================================================

  const colors = [

    "#171717",
    "#ffffff",

    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#eab308",

    "#22c55e",
    "#10b981",
    "#06b6d4",

    "#3b82f6",
    "#6366f1",
    "#8b5cf6",

    "#ec4899",
    "#f43f5e"

  ];


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
      stroke.color || "#171717";

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
  // REDRAW
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


    canvas.width =
      1200;


    canvas.height =
      700;


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


    websocket.onopen = () => {

      console.log(
        "[WS CONNECTED]"
      );

      setConnected(true);

    };


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


      // ------------------------------------------------------
      // ROOM INFO
      // ------------------------------------------------------

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


      // ------------------------------------------------------
      // NEW STROKE
      // ------------------------------------------------------

      if (
        data.type === "stroke"
      ) {

        strokesRef.current.push(
          data.stroke
        );


        redrawBoard();


        return;
      }


      // ------------------------------------------------------
      // BOARD STATE
      // ------------------------------------------------------

      if (
        data.type === "board_state"
      ) {

        strokesRef.current =
          data.strokes || [];


        redrawBoard();


        return;
      }


      // ------------------------------------------------------
      // ROOM DELETED
      // ------------------------------------------------------

      if (
        data.type === "room_deleted"
      ) {

        if (
          data.reason ===
          "inactivity"
        ) {

          setMessage(
            "This room was deleted because of inactivity."
          );

        } else {

          setMessage(
            "The host deleted this room."
          );

        }


        setTimeout(
          () => {

            navigate("/");

          },
          1500
        );


        return;
      }


      // ------------------------------------------------------
      // PERMISSION DENIED
      // ------------------------------------------------------

      if (
        data.type ===
        "permission_denied"
      ) {

        setMessage(
          "You don't have permission to perform that action."
        );


        setTimeout(
          () => {

            setMessage("");

          },
          2500
        );

      }

    };


    websocket.onerror = (
      error
    ) => {

      console.error(
        "[WS ERROR]",
        error
      );

      setConnected(false);

    };


    websocket.onclose = () => {

      console.log(
        "[WS CLOSED]"
      );

      setConnected(false);

    };


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


    // --------------------------------------------------------
    // ERASER
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // PEN
    // --------------------------------------------------------

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


    sendMessage({

      type:
        "stroke",

      stroke: {

        points:
          currentStroke.current,

        color:
          color,

        size:
          size,

        tool:
          "pen"

      }

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


    for (
      let i =
        strokesRef.current.length - 1;

      i >= 0;

      i--
    ) {

      const stroke =
        strokesRef.current[i];


      if (
        stroke.user_id !==
        userId.current
      ) {

        continue;
      }


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
  // DISTANCE TO SEGMENT
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

        (px - x1) ** 2 +
        (py - y1) ** 2

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
      x1 + t * dx;


    const closestY =
      y1 + t * dy;


    return Math.sqrt(

      (px - closestX) ** 2 +
      (py - closestY) ** 2

    );

  };


  // ==========================================================
  // UNDO
  // ==========================================================

  const undo = () => {

    sendMessage({
      type: "undo"
    });

  };


  // ==========================================================
  // REDO
  // ==========================================================

  const redo = () => {

    sendMessage({
      type: "redo"
    });

  };


  // ==========================================================
  // DELETE MY STROKES
  // ==========================================================

  const deleteMyStrokes = () => {

    setShowHostMenu(false);


    if (
      window.confirm(
        "Delete all of your strokes?"
      )
    ) {

      sendMessage({

        type:
          "delete_my_strokes"

      });

    }

  };


  // ==========================================================
  // DELETE ALL
  // ==========================================================

  const deleteAllStrokes = () => {

    setShowHostMenu(false);


    if (
      window.confirm(
        "Delete ALL strokes for everyone?"
      )
    ) {

      sendMessage({

        type:
          "delete_all_strokes"

      });

    }

  };


  // ==========================================================
  // DELETE ROOM
  // ==========================================================

  const deleteRoom = () => {

    setShowHostMenu(false);


    if (
      window.confirm(
        "Delete this room permanently?"
      )
    ) {

      sendMessage({

        type:
          "delete_room"

      });

    }

  };


  // ==========================================================
  // COPY ROOM CODE
  // ==========================================================

  const copyRoomCode = async () => {

    try {

      await navigator.clipboard.writeText(
        roomCode
      );


      setMessage(
        "Room code copied!"
      );


      setTimeout(
        () => {

          setMessage("");

        },
        1500
      );

    } catch {

      setMessage(
        "Unable to copy room code."
      );

    }

  };


  // ==========================================================
  // ROOM UI
  // ==========================================================

  return (

    <div className="room-page">

      {/* ====================================================
          HEADER
          ==================================================== */}

      <header className="top-header">

        <div className="brand">

          <div className="brand-icon">
            ✦
          </div>

          <span>
            Sketchers
          </span>

        </div>


        <div className="room-info">

          <span className="room-label">
            ROOM
          </span>


          <button
            className="room-code"
            onClick={
              copyRoomCode
            }
            title="Copy room code"
          >
            {roomCode}
          </button>


          {isHost && (

            <span className="host-badge">
              HOST
            </span>

          )}

        </div>


        <div className="connection-status">

          <span
            className={
              connected
                ? "status-dot connected"
                : "status-dot disconnected"
            }
          />

          <span>
            {connected
              ? "Synced"
              : "Disconnected"}
          </span>

        </div>

      </header>


      {/* ====================================================
          TOOLBAR
          ==================================================== */}

      <div className="toolbar">

        {/* Tools */}

        <div className="toolbar-group">

          <button
            className={
              tool === "pen"
                ? "tool-button active"
                : "tool-button"
            }
            onClick={() =>
              setTool("pen")
            }
            title="Pen"
          >
            ✏️
          </button>


          <button
            className={
              tool === "eraser"
                ? "tool-button active"
                : "tool-button"
            }
            onClick={() =>
              setTool("eraser")
            }
            title="Stroke eraser"
          >
            🧽
          </button>

        </div>


        <div className="toolbar-separator" />


        {/* Colors */}

        <div className="color-palette">

          {colors.map(
            (paletteColor) => (

              <button

                key={
                  paletteColor
                }

                className={
                  color ===
                  paletteColor
                    ? "color-swatch selected"
                    : "color-swatch"
                }

                style={{
                  backgroundColor:
                    paletteColor
                }}

                onClick={() => {

                  setColor(
                    paletteColor
                  );

                  setTool(
                    "pen"
                  );

                }}

                title={
                  paletteColor
                }

              />

            )
          )}


          <input

            className="custom-color"

            type="color"

            value={color}

            onChange={(event) => {

              setColor(
                event.target.value
              );

              setTool(
                "pen"
              );

            }}

            title="Custom color"

          />

        </div>


        <div className="toolbar-separator" />


        {/* Brush size */}

        <div className="size-control">

          <span className="size-label">
            Size
          </span>


          <input

            type="range"

            min="1"

            max="30"

            value={size}

            onChange={(event) => {

              setSize(
                Number(
                  event.target.value
                )
              );

            }}

          />


          <span className="size-value">
            {size}
          </span>

        </div>


        <div className="toolbar-separator" />


        {/* Undo / Redo */}

        <div className="toolbar-group">

          <button
            className="action-button"
            onClick={undo}
            title="Undo"
          >
            ↶
          </button>


          <button
            className="action-button"
            onClick={redo}
            title="Redo"
          >
            ↷
          </button>

        </div>


        {/* Spacer */}

        <div className="toolbar-spacer" />


        {/* My strokes */}

        <button
          className="toolbar-text-button"
          onClick={
            deleteMyStrokes
          }
        >
          My Strokes
        </button>


        {/* Host menu */}

        {isHost && (

          <div className="host-menu-container">

            <button

              className={
                showHostMenu
                  ? "host-button open"
                  : "host-button"
              }

              onClick={() =>
                setShowHostMenu(
                  !showHostMenu
                )
              }

            >
              👑 Host ▾
            </button>


            {showHostMenu && (

              <div className="host-menu">

                <div className="host-menu-title">
                  Host Controls
                </div>


                <button
                  onClick={
                    deleteAllStrokes
                  }
                >
                  🗑️ Delete All Strokes
                </button>


                <button
                  className="danger"
                  onClick={
                    deleteRoom
                  }
                >
                  🚪 Delete Room
                </button>

              </div>

            )}

          </div>

        )}

      </div>


      {/* ====================================================
          MESSAGE
          ==================================================== */}

      {message && (

        <div className="floating-message">

          {message}

        </div>

      )}


      {/* ====================================================
          CANVAS
          ==================================================== */}

      <main className="canvas-area">

        <div className="canvas-wrapper">

          <canvas

            ref={
              canvasRef
            }

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

          />

        </div>

      </main>

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