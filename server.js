const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

app.get("/", (req,res)=>{
 res.json({message:"Foosball backend running"})
})

const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

app.get("/leaderboard", async (req,res)=>{

 const players = await prisma.player.findMany({
  orderBy:{wins:"desc"}
 })

 res.json(players)

})

app.post("/win", async (req,res)=>{

 const {name} = req.body

 const player = await prisma.player.upsert({
  where:{name},
  update:{wins:{increment:1}},
  create:{name,wins:1}
 })

 res.json(player)

})

const http = require("http")
const { Server } = require("socket.io")

const server = http.createServer(app)

const io = new Server(server,{
 cors:{origin:"*"}
})

server.listen(3000)

let users = []

io.on("connection",(socket)=>{

 socket.on("join",(username)=>{

  users.push({id:socket.id, username})

  io.emit("activeUsers",users)

 })

 socket.on("disconnect",()=>{

  users = users.filter(u=>u.id !== socket.id)

  io.emit("activeUsers",users)

 })

})

let waitingPlayer = null

socket.on("findMatch",()=>{

 if(!waitingPlayer){
  waitingPlayer = socket
 }
 else{

  const roomId = "game-"+Date.now()

  waitingPlayer.join(roomId)
  socket.join(roomId)

  io.to(roomId).emit("startGame")

  waitingPlayer = null

 }

})

socket.on("push",(data)=>{
 io.to(data.room).emit("push",data)
})

socket.on("tug",(data)=>{
 io.to(data.room).emit("tug",data)
})

socket.on("ballUpdate",(data)=>{
 io.to(data.room).emit("ballUpdate",data)
})

socket.on("scoreUpdate",(data)=>{
 io.to(data.room).emit("scoreUpdate",data)
})

