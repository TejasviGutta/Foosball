const express = require("express")
const cors = require("cors")
const http = require("http")
const { Server } = require("socket.io")
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

const app = express()

app.use(cors())
app.use(express.json())

// Root test route
app.get("/", (req,res)=>{
    res.json({message:"Foosball backend running"})
})

// Leaderboard route
app.get("/leaderboard", async (req,res)=>{

    try{

    const players = await prisma.player.findMany({
        orderBy:{wins:"desc"}
    })

    res.json(players)

    }catch(err){

        res.status(500).json({error:"database error"})

    }

})

// Record win
app.post("/win", async (req,res)=>{

    const {name} = req.body

    const player = await prisma.player.upsert({
        where:{name},
        update:{wins:{increment:1}},
        create:{name,wins:1}
    })

    res.json(player)

})

const server = http.createServer(app)

const io = new Server(server,{
    cors:{origin:"*"}
})

let users = []
let waitingPlayer = null

io.on("connection",(socket)=>{

    console.log("User connected:", socket.id)

    // user joins
    socket.on("join",(username)=>{
    users = users.filter(u=> u.id !== socket.id) 
    users.push({id:socket.id, username})

    io.emit("activeUsers",users)

})

// matchmaking
socket.on("findMatch",()=>{

    if(!waitingPlayer){

        waitingPlayer = socket

    } else{

        const roomId = "game-"+Date.now()

        waitingPlayer.join(roomId)
        socket.join(roomId)

        waitingPlayer.room = roomId
        socket.room = roomId
        io.to(roomId).emit("matchFound", {room:roomId})
        io.to(roomId).emit("startGame", {room:roomId})

        waitingPlayer = null

    }

})

// gameplay events
socket.on("push",(data)=>{
 if(!data.room) return
 io.to(data.room).emit("push",data)
})

socket.on("tug",(data)=>{
    if(!data.room) return
    io.to(data.room).emit("tug",data)
})

socket.on("ballUpdate",(data)=>{
    if(!data.room) return
    io.to(data.room).emit("ballUpdate",data)
})

socket.on("scoreUpdate",(data)=>{
    if(!data.room) return
    io.to(data.room).emit("scoreUpdate",data)
})

socket.on("disconnect",()=>{

    users = users.filter(u=>u.id !== socket.id)

    if(waitingPlayer && waitingPlayer.id === socket.id){
        waitingPlayer = null
    }

    io.emit("activeUsers",users)

})

})

const PORT = process.env.PORT || 3000

server.listen(PORT,()=>{
    console.log("Server running on port", PORT)
})