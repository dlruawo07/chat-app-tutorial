import express from "express";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(__filename);
console.log(__dirname);

const PORT = process.env.PORT || 3001;
const ADMIN = "Admin";

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const expressServer = app.listen(PORT, () =>
  console.log(`Server listening on port ${PORT}...`)
);

// state
const UsersState = {
  users: [],
  setUesrs: function (newUsersArray) {
    this.users = newUsersArray;
  },
};

const io = new Server(expressServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? false
        : ["http://localhost:5500", "http://127.0.0.1:5500"],
  },
});

io.on("connection", (socket) => {
  console.log(`User ${socket.id} connected`);

  // Upon connection - only to user
  socket.emit("message", buildMsg(ADMIN, "Welcome to Chat App!"));

  //
  socket.on("enterRoom", ({ name, room }) => {
    // leave a previous room if he was in other room
    const prevRoom = getUser(socket.id)?.room;
    if (prevRoom) {
      socket.leave(prevRoom);
      io.to(prevRoom).emit(
        "message",
        buildMsg(ADMIN, `${name} has left the room`)
      );
    }
    const user = activateUser(socket.id, name, room);

    // Cannot update previous room users list until after the state update in activate user
    if (prevRoom) {
      io.to(prevRoom).emit("usersList", { users: getUsersInRoom(prevRoom) });
    }

    // join room
    socket.join(user.room);

    // To user who joined
    socket.emit(
      "message",
      buildMsg(ADMIN, `You have joined the ${user.room} chat room`)
    );

    // To everyone else
    socket.broadcast
      .to(user.room)
      .emit("message", buildMsg(ADMIN, `${user.name} has joined the room`));

    // Update user list for room
    io.to(user.room).emit("usersList", { users: getUsersInRoom(user.room) });

    // Update rooms list for everyone
    io.emit("roomsList", { rooms: getAllActiveRooms() });
  });

  // When user disconnects - to all others
  socket.on("disconnect", () => {
    const user = getUser(socket.id);
    userLeavesApp(socket.id);

    if (user) {
      io.to(user.room).emit(
        "message",
        buildMsg(ADMIN, `${user.name} has left the room`)
      );

      io.to(user.room).emit("usersList", { users: getUsersInRoom(user.room) });

      io.emit("roomsList", { rooms: getAllActiveRooms() });
    }

    console.log(`User ${socket.id} disconnected`);
  });

  socket.on("message", ({ name, text }) => {
    const room = getUser(socket.id)?.room;
    if (room) {
      io.to(room).emit("message", buildMsg(name, text));
    }
  });

  // Listen for activity
  socket.on("activity", ({ name }) => {
    const room = getUser(socket.id)?.room;
    if (room) {
      socket.broadcast.to(room).emit("activity", name);
    }
  });
});

const buildMsg = (name, text) => {
  return {
    name,
    text,
    time: new Intl.DateTimeFormat("default", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).format(new Date()),
  };
};

// User functions
const activateUser = (id, name, room) => {
  const user = { id, name, room };
  UsersState.setUesrs([
    ...UsersState.users.filter((user) => user.id !== id),
    user,
  ]);
  return user;
};

const userLeavesApp = (id) => {
  UsersState.setUesrs(UsersState.users.filter((user) => user.id !== id));
};

const getUser = (id) => {
  return UsersState.users.find((user) => user.id === id);
};

const getUsersInRoom = (room) => {
  return UsersState.users.filter((user) => user.room === room);
};

const getAllActiveRooms = () => {
  return Array.from(new Set(UsersState.users.map((user) => user.room)));
};
