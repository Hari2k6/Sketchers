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
          { method: "POST" }
        );

      const data =
        await response.json();

      if (data.success) {

        navigate(`/room/${data.room_code}`);

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

        <h1>Sketchers</h1>

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

              if (event.key === "Enter") {
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

  const { roomCode } =
    useParams();

  const navigate =
    useNavigate();

  const userId =
    useRef(getUserId());


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

  const [paletteStyle, setPaletteStyle] =
    useState("circle");

  const [showColorPicker, setShowColorPicker] =
    useState(false);

  const [hue, setHue] =
    useState(250);

  const [saturation, setSaturation] =
    useState(0.85);

  const [value, setValue] =
    useState(0.95);

  const [showShapeMenu, setShowShapeMenu] =
    useState(false);

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

  const currentPoints =
    useRef([]);

  const lastPoint =
    useRef(null);

  const erasedThisDrag =
    useRef(new Set());

  const colorAreaRef =
    useRef(null);


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


  const shapes = [
    {
      id: "line",
      label: "Line",
      icon: "╱"
    },
    {
      id: "rectangle",
      label: "Rectangle",
      icon: "▭"
    },
    {
      id: "square",
      label: "Square",
      icon: "□"
    },
    {
      id: "ellipse",
      label: "Oval",
      icon: "⬭"
    },
    {
      id: "circle",
      label: "Circle",
      icon: "○"
    }
  ];


  // ==========================================================
  // COLOR PICKER HELPERS
  // ==========================================================

  const hsvToHex = (h, s, v) => {

    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) {
      r = c; g = x;
    } else if (h < 120) {
      r = x; g = c;
    } else if (h < 180) {
      g = c; b = x;
    } else if (h < 240) {
      g = x; b = c;
    } else if (h < 300) {
      r = x; b = c;
    } else {
      r = c; b = x;
    }

    const toHex = (channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };


  const hexToHsv = (hex) => {

    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;

    if (d !== 0) {
      if (max === r) {
        h = 60 * (((g - b) / d) % 6);
      } else if (max === g) {
        h = 60 * ((b - r) / d + 2);
      } else {
        h = 60 * ((r - g) / d + 4);
      }
    }

    if (h < 0) h += 360;

    return {
      h,
      s: max === 0 ? 0 : d / max,
      v: max
    };
  };


  const setColorFromHex = (hex) => {

    const hsv = hexToHsv(hex);

    setColor(hex);
    setHue(hsv.h);
    setSaturation(hsv.s);
    setValue(hsv.v);
  };


  const pickFromColorArea = (event) => {

    const area = colorAreaRef.current;

    if (!area) return;

    const rect = area.getBoundingClientRect();

    const x = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width)
    );

    const y = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height)
    );

    const nextSaturation = x;
    const nextValue = 1 - y;
    const nextColor = hsvToHex(
      hue,
      nextSaturation,
      nextValue
    );

    setSaturation(nextSaturation);
    setValue(nextValue);
    setColor(nextColor);
    setTool("pen");
  };


  const handleColorAreaPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pickFromColorArea(event);
  };


  const handleColorAreaPointerMove = (event) => {
    if (event.buttons === 1) {
      pickFromColorArea(event);
    }
  };


  const handleHueChange = (event) => {

    const nextHue = Number(event.target.value);
    setHue(nextHue);
    setColor(
      hsvToHex(
        nextHue,
        saturation,
        value
      )
    );
    setTool("pen");
  };


  // ==========================================================
  // CANVAS COORDINATES
  // ==========================================================

  const getCanvasPoint = (event) => {

    const canvas =
      canvasRef.current;

    const rect =
      canvas.getBoundingClientRect();

    return {

      x:
        (event.clientX - rect.left) *
        (canvas.width / rect.width),

      y:
        (event.clientY - rect.top) *
        (canvas.height / rect.height)

    };

  };


  // ==========================================================
  // DRAW A STROKE
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
  // PREVIEW SHAPE
  // ==========================================================

  const getShapePoints = (
    start,
    end,
    shape
  ) => {

    let x1 = start.x;
    let y1 = start.y;

    let x2 = end.x;
    let y2 = end.y;


    // --------------------------------------------------------
    // LINE
    // --------------------------------------------------------

    if (shape === "line") {

      return [
        { x: x1, y: y1 },
        { x: x2, y: y2 }
      ];

    }


    // --------------------------------------------------------
    // SQUARE / CIRCLE
    // --------------------------------------------------------

    if (
      shape === "square" ||
      shape === "circle"
    ) {

      const dx =
        x2 - x1;

      const dy =
        y2 - y1;

      const side =
        Math.max(
          Math.abs(dx),
          Math.abs(dy)
        );


      x2 =
        x1 +
        (dx < 0 ? -side : side);

      y2 =
        y1 +
        (dy < 0 ? -side : side);

    }


    // --------------------------------------------------------
    // RECTANGLE / SQUARE
    // --------------------------------------------------------

    if (
      shape === "rectangle" ||
      shape === "square"
    ) {

      return [

        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
        { x: x1, y: y1 }

      ];

    }


    // --------------------------------------------------------
    // ELLIPSE / CIRCLE
    // --------------------------------------------------------

    if (
      shape === "ellipse" ||
      shape === "circle"
    ) {

      const centerX =
        (x1 + x2) / 2;

      const centerY =
        (y1 + y2) / 2;

      const radiusX =
        Math.abs(x2 - x1) / 2;

      const radiusY =
        Math.abs(y2 - y1) / 2;

      const points = [];

      const segments = 64;


      for (
        let i = 0;
        i <= segments;
        i++
      ) {

        const angle =
          (Math.PI * 2 * i) /
          segments;


        points.push({

          x:
            centerX +
            radiusX *
            Math.cos(angle),

          y:
            centerY +
            radiusY *
            Math.sin(angle)

        });

      }


      return points;

    }


    return [];

  };


  // ==========================================================
  // DRAW PREVIEW
  // ==========================================================

  const drawPreview = (
    points
  ) => {

    const canvas =
      canvasRef.current;

    const context =
      canvas.getContext("2d");


    redrawBoard();


    drawStroke(
      context,
      {
        points,
        color,
        size
      }
    );

  };


  // ==========================================================
  // CANVAS INITIALIZATION
  // ==========================================================

  useEffect(() => {

    const canvas =
      canvasRef.current;


    canvas.width = 1200;
    canvas.height = 700;


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

      console.log("[WS CONNECTED]");

      setConnected(true);

    };


    websocket.onmessage = (event) => {

      const data =
        JSON.parse(event.data);


      console.log(
        "[WS RECEIVED]",
        data
      );


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


      if (
        data.type === "stroke"
      ) {

        strokesRef.current.push(
          data.stroke
        );

        redrawBoard();

        return;
      }


      if (
        data.type === "board_state"
      ) {

        strokesRef.current =
          data.strokes || [];

        redrawBoard();

        return;
      }


      if (
        data.type === "room_deleted"
      ) {

        setMessage(
          data.reason === "inactivity"
            ? "This room was deleted because of inactivity."
            : "The host deleted this room."
        );


        setTimeout(
          () => navigate("/"),
          1500
        );

        return;
      }


      if (
        data.type === "permission_denied"
      ) {

        setMessage(
          "You don't have permission to perform that action."
        );


        setTimeout(
          () => setMessage(""),
          2500
        );

      }

    };


    websocket.onerror = (error) => {

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

  const sendMessage = (message) => {

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
  // DRAG ERASER
  // ==========================================================

  const eraseAtPoint = (x, y) => {

    const hitStroke =
      findOwnStrokeAtPoint(x, y);

    if (!hitStroke) return;

    if (erasedThisDrag.current.has(hitStroke.id)) {
      return;
    }

    erasedThisDrag.current.add(hitStroke.id);

    sendMessage({
      type: "erase_stroke",
      stroke_id: hitStroke.id
    });
  };


  // ==========================================================
  // MOUSE DOWN
  // ==========================================================

  const handleMouseDown = (event) => {

    const point =
      getCanvasPoint(event);


    // --------------------------------------------------------
    // EYEDROPPER
    // --------------------------------------------------------

    if (tool === "picker") {

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d", {
        willReadFrequently: true
      });

      const pixel = context.getImageData(
        Math.floor(point.x),
        Math.floor(point.y),
        1,
        1
      ).data;

      const picked = `#${[pixel[0], pixel[1], pixel[2]]
        .map(value => value.toString(16).padStart(2, "0"))
        .join("")}`;

      setColorFromHex(picked);
      setTool("pen");
      setMessage(`Picked ${picked.toUpperCase()}`);
      setTimeout(() => setMessage(""), 1200);
      return;
    }


    // --------------------------------------------------------
    // ERASER
    // --------------------------------------------------------

    if (tool === "eraser") {

      isDrawing.current = true;
      erasedThisDrag.current.clear();
      eraseAtPoint(point.x, point.y);
      return;
    }


    isDrawing.current =
      true;


    currentPoints.current = [
      point
    ];

    lastPoint.current =
      point;


    if (tool !== "pen") {

      drawPreview(
        getShapePoints(
          point,
          point,
          tool
        )
      );

    }

  };


  // ==========================================================
  // MOUSE MOVE
  // ==========================================================

  const handleMouseMove = (event) => {

    if (!isDrawing.current) {
      return;
    }


    const point =
      getCanvasPoint(event);

    if (tool === "eraser") {
      eraseAtPoint(point.x, point.y);
      return;
    }

    lastPoint.current =
      point;


    // --------------------------------------------------------
    // FREEHAND PEN
    // --------------------------------------------------------

    if (tool === "pen") {

      const points =
        currentPoints.current;


      const previous =
        points[points.length - 1];


      points.push(point);


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


      return;
    }


    // --------------------------------------------------------
    // SHAPE PREVIEW
    // --------------------------------------------------------

    drawPreview(
      getShapePoints(
        currentPoints.current[0],
        point,
        tool
      )
    );

  };


  // ==========================================================
  // MOUSE UP
  // ==========================================================

  const handleMouseUp = (event) => {

    if (tool === "eraser") {
      isDrawing.current = false;
      erasedThisDrag.current.clear();
      return;
    }

    if (!isDrawing.current) {
      return;
    }

    const endPoint =
      getCanvasPoint(event);

    finishStroke(endPoint);
  };


  const handleMouseLeave = () => {

    if (tool === "eraser") {
      isDrawing.current = false;
      erasedThisDrag.current.clear();
      return;
    }

    if (isDrawing.current && tool === "pen") {
      isDrawing.current = false;
      currentPoints.current = [];
      redrawBoard();
    }
  };

  // ==========================================================
  // FINISH STROKE
  // ==========================================================

  const finishStroke = (endPoint) => {

    const startPoint =
      currentPoints.current[0];

    if (!startPoint) {
      isDrawing.current = false;
      return;
    }

    let points;

    if (tool === "pen") {
      points = currentPoints.current;
    } else {
      points = getShapePoints(
        startPoint,
        endPoint,
        tool
      );
    }

    if (points.length >= 2) {
      sendMessage({
        type: "stroke",
        stroke: {
          points,
          color,
          size,
          tool
        }
      });
    }

    isDrawing.current = false;
    currentPoints.current = [];
    lastPoint.current = null;
    redrawBoard();
  };


  // ==========================================================
  // ERASE HIT TEST
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
        stroke.points || [];


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
          (stroke.size || 5) / 2;


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
  // ACTIONS
  // ==========================================================

  const undo = () => {

    sendMessage({
      type: "undo"
    });

  };


  const redo = () => {

    sendMessage({
      type: "redo"
    });

  };


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


  const copyRoomCode = async () => {

    try {

      await navigator.clipboard.writeText(
        roomCode
      );

      setMessage(
        "Room code copied!"
      );


      setTimeout(
        () => setMessage(""),
        1500
      );

    } catch {

      setMessage(
        "Unable to copy room code."
      );

    }

  };


  const selectTool = (newTool) => {

    setTool(newTool);

    setShowShapeMenu(false);

  };


  // ==========================================================
  // ROOM UI
  // ==========================================================

  return (

    <div className="room-page">

      <header className="top-header">

        <div className="brand">

          <div className="brand-icon">
            ✦
          </div>

          <span>Sketchers</span>

        </div>


        <div className="room-info">

          <span className="room-label">
            ROOM
          </span>


          <button
            className="room-code"
            onClick={copyRoomCode}
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


      <div className="toolbar">

        {/* --------------------------------------------------
            MAIN TOOLS
            -------------------------------------------------- */}

        <div className="toolbar-group">

          <button
            className={
              tool === "pen"
                ? "tool-button active"
                : "tool-button"
            }
            onClick={() =>
              selectTool("pen")
            }
            title="Pen"
          >
            ✏️
          </button>


          <div className="shape-selector">

            <button
              className={
                shapes.some(
                  shape =>
                    shape.id === tool
                )
                  ? "tool-button active"
                  : "tool-button"
              }
              onClick={() =>
                setShowShapeMenu(
                  !showShapeMenu
                )
              }
              title="Shapes"
            >
              ◇
            </button>


            {showShapeMenu && (

              <div className="shape-menu">

                <div className="menu-title">
                  Shapes
                </div>


                {shapes.map(
                  (shape) => (

                    <button
                      key={shape.id}
                      className={
                        tool === shape.id
                          ? "menu-item selected"
                          : "menu-item"
                      }
                      onClick={() =>
                        selectTool(
                          shape.id
                        )
                      }
                    >

                      <span className="shape-icon">
                        {shape.icon}
                      </span>

                      <span>
                        {shape.label}
                      </span>

                    </button>

                  )
                )}

              </div>

            )}

          </div>


          <button
            className={
              tool === "eraser"
                ? "tool-button active"
                : "tool-button"
            }
            onClick={() =>
              selectTool("eraser")
            }
            title="Stroke eraser"
          >
            🧽
          </button>

        </div>


        <div className="toolbar-separator" />


        {/* --------------------------------------------------
            PALETTE / DYNAMIC COLOR PICKER
            -------------------------------------------------- */}

        <div className="palette-area">

          <div className="color-palette">

            {colors.map(
              (paletteColor) => (

                <button
                  key={paletteColor}
                  className={
                    paletteStyle === "circle"
                      ? (
                        color === paletteColor
                          ? "color-swatch circle selected"
                          : "color-swatch circle"
                      )
                      : (
                        color === paletteColor
                          ? "color-swatch rectangle selected"
                          : "color-swatch rectangle"
                      )
                  }
                  style={{
                    backgroundColor: paletteColor
                  }}
                  onClick={() => {
                    setColorFromHex(paletteColor);
                    setTool("pen");
                  }}
                  title={paletteColor}
                />

              )
            )}

          </div>


          <div className="dynamic-color-picker">

            <button
              className={
                showColorPicker
                  ? "dynamic-color-button open"
                  : "dynamic-color-button"
              }
              style={{
                backgroundColor: color
              }}
              onClick={() =>
                setShowColorPicker(
                  current => !current
                )
              }
              title="Choose any color"
            />


            {showColorPicker && (

              <div className="color-picker-panel">

                <div
                  ref={colorAreaRef}
                  className="color-area"
                  style={{
                    background: `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, hsl(${hue} 100% 50%))`
                  }}
                  onPointerDown={
                    handleColorAreaPointerDown
                  }
                  onPointerMove={
                    handleColorAreaPointerMove
                  }
                >

                  <div
                    className="color-area-cursor"
                    style={{
                      left: `${saturation * 100}%`,
                      top: `${(1 - value) * 100}%`
                    }}
                  />

                </div>


                <div className="hue-control">

                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={hue}
                    onChange={
                      handleHueChange
                    }
                    className="hue-slider"
                  />

                </div>


                <div className="selected-color-info">

                  <span
                    className="selected-color-preview"
                    style={{
                      backgroundColor: color
                    }}
                  />

                  <span className="selected-color-hex">
                    {color.toUpperCase()}
                  </span>

                </div>

              </div>

            )}

          </div>


          <button
            className="palette-style-button"
            onClick={() =>
              setPaletteStyle(
                paletteStyle === "circle"
                  ? "rectangle"
                  : "circle"
              )
            }
            title="Switch palette style"
          >
            {paletteStyle === "circle"
              ? "●"
              : "▬"}
          </button>


          <button
            className={
              tool === "picker"
                ? "eyedropper-button active"
                : "eyedropper-button"
            }
            onClick={() =>
              selectTool("picker")
            }
            title="Pick a color from the canvas"
          >
            🖌️
          </button>

        </div>

        <div className="toolbar-separator" />


        {/* --------------------------------------------------
            SIZE
            -------------------------------------------------- */}

        <div className="size-control">

          <span className="size-label">
            Size
          </span>


          <input
            type="range"
            min="1"
            max="30"
            value={size}
            onChange={(event) =>
              setSize(
                Number(
                  event.target.value
                )
              )
            }
          />


          <span className="size-value">
            {size}
          </span>

        </div>


        <div className="toolbar-separator" />


        {/* --------------------------------------------------
            UNDO REDO
            -------------------------------------------------- */}

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


        <div className="toolbar-spacer" />


        <button
          className="toolbar-text-button"
          onClick={
            deleteMyStrokes
          }
        >
          My Strokes
        </button>


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


      {message && (

        <div className="floating-message">
          {message}
        </div>

      )}


      <main className="canvas-area">

        <div className="canvas-wrapper">

          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
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
