const express = require('express')
const app = express()
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000
require('dotenv').config()
const stripe = require("stripe")(process.env.PAYMENT_KEY);

const cors = require('cors')

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
//middleware
app.use(cors())
app.use(express.json())

//verify token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  //console.log('Authorization Header:', authorization); // Debugging log
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Invalid authorization' });
  }

  const token = authorization.split(' ')[1];
  //console.log('Token:', token); // Debugging log
  jwt.verify(token, process.env.ACCESS_SECRET, (err, decoded) => {
    if (err) {
      console.error('Token verification error:', err); // Debugging log
      return res.status(403).send({ error: true, message: 'Forbidden access' });
    }
    req.decoded = decoded;
    //console.log(decoded)
    next();
  });
};


//mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@smart-class-hub.gcdebwr.mongodb.net/?retryWrites=true&w=majority&appName=smart-class-hub`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //create a database and collection
    const database = client.db("smart-class-hub");
    
    const usersCollection = database.collection("users");
    const classesCollection = database.collection("classes");
    const cartCollection = database.collection("cart");
    const paymentCollection = database.collection("payments");
    const enrolledCollection = database.collection("enrolled");
    const appliedCollection = database.collection("applied");

    

    //middlewares for admin and instructor
    const verifyAdmin = async (req,res,next)=>{
      const email = req.decoded.email;
      const query = {email:email};
      const user = await usersCollection.findOne(query);
      if(user.role === 'admin'){
        next();
      }else{
        return res.status(401).send({error: true,message:'Unauthorized access'})
      }
    }

    //const verifyInstructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user.role === 'instructor' || user.role === 'admin') {
          next()
      }
      else {
          return res.status(401).send({ error: true, message: 'Unauthorized access' })
      }
    }
    //generate tokens
    //get the token by using crypto random bytes using 1st command as node and 2nd as require('crypto').randomBytes(64).toString('hex')
    app.post('/api/set-token', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_SECRET, {
        expiresIn: '24h'
      });
      res.send({ token });
    });
    //classes collections 
    app.post('/new-class',verifyJWT,verifyInstructor,async(req,res)=>{
      const newClass = req.body;
      newClass.availableSeats = parseInt(newClass.availableSeats);
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    app.get('/',(req,res)=>{
      res.end("Smart Class Hub server is running")
    })
    
    app.get('/classes',async(req,res)=>{
      const query = {status:"approved"};
      const result = await classesCollection.find(query).toArray();
      res.send(result)
    })

    //get classes by instructor email
    app.get('/classes/:email', verifyJWT, verifyInstructor, async (req, res) => {
      //console.log(req.params.email)
      const email = req.params.email;
      const query = { instructorEmail: email };
      //console.log(query)
      const result = await classesCollection.find(query).toArray();
      res.send(result);
      //console.log(result)
  })

    //manage classes
    app.get('/classes-manage',async(req,res)=>{
      const result = await classesCollection.find().toArray();
      res.send(result);
    })

    //update classes only update status and reason
    app.put('/change-status/:id',verifyJWT,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const status = req.body.status;
      const reason = req.body.reason;
      const filter ={_id: new ObjectId(id)};
      const options = {upsert :true};
      const updateDoc = {
        $set :{
          status:status,
          reason:reason,
        },
      };
      const result = await classesCollection.updateOne(filter,updateDoc,options);
      res.send(result);
    })

    //get approved classes
    app.get('/approved-classes',async(req,res)=>{
      const query={status :"approved"};
      const result = await classesCollection.find(query).toArray();
      res.send(result)
    });

    //get approved classes through email
    app.get('/approved-classes/:email',verifyJWT,verifyInstructor,async(req,res)=>{
      const email = req.params.email;
      const query={status :"approved",instructorEmail:email};
      const result = await classesCollection.find(query).toArray();
      res.send(result)
    });

    //get all pending classes through email
    app.get('/pending-classes/:email',verifyJWT,verifyInstructor,async(req,res)=>{
      const email = req.params.email;
      const query={status :"pending",instructorEmail:email};
      const result = await classesCollection.find(query).toArray();
      res.send(result)
    });

    //get single classes
    /*app.get('/class/:id',async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await classesCollection.findOne(query);
      res.send(result)
    })*/

    
    app.get('/class/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await classesCollection.findOne(query);
            res.send(result);
        }) 
    //update class details {all data}
    app.put('/update-class/:id',verifyJWT,verifyInstructor,async(req,res)=>{
      const id = req.params.id;
      const updateClass = req.body;
      const filter  = {_id: new ObjectId(id)};
      const options = {upsert:true};
      const updateDoc = {
        $set :{
          name : updateClass.name,
          description : updateClass.description,
          price:updateClass.price,
          availableSeats : parseInt(updateClass.availableSeats),
          videoLink:updateClass.videoLink,
          status:'pending'
        }
      }
      const result = await classesCollection.updateOne(filter,updateDoc,options)
      res.send(result)
    })



    //users routes-----------------------------------------------------------------------------------------------
    app.post('/new-user',async(req,res)=>{
      const newUser = req.body;
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    })

    //get users
    app.get('/users',async(req,res)=>{
      const result = await usersCollection.find({}).toArray();
      res.send(result);

    })

    //get user by id
    app.get('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const user = await usersCollection.findOne(query);
      res.send(user);
  })

    //get user by email
    app.get('/user/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    //delete users
    app.delete('/delete-user/:id',verifyJWT,verifyAdmin,async(req,res)=>{
      const id = req.params.id;
      const query = {_id:new ObjectId(id)};
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })

    //update users
    app.put('/update-user/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedUser = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
          $set: {
              name: updatedUser.name,
              email: updatedUser.email,
              role: updatedUser.option,
              address: updatedUser.address,
              phone: updatedUser.phone,
              about: updatedUser.about,
              photoUrl: updatedUser.photoUrl,
              skills: updatedUser.skills ? updatedUser.skills : null,
          }
      }
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
  })



    //cart routes-------------------------------------------------------------------------------------------------
    app.post('/add-to-cart',verifyJWT,async(req,res)=>{
      const newCartItem = req.body;
      const result = await cartCollection.insertOne(newCartItem)
      res.send(result);
    })

    
    //get cart by id
    app.get('/cart-item/:id',verifyJWT,async(req,res)=>{
      const id = req.params.id;
      const email = req.query.email;
      const query = {
        classId:id,
        userMail:email
      };
      const projection = {classId:1};
      const result = await cartCollection.findOne(query,{projection : projection})
      res.send(result)
    })

    //get cart info by id
    app.get('/cart/:email',verifyJWT,async(req,res)=>{
      const email = req.params.email;
      const query = {userMail:email};
      const projection = {classId:1};
      const carts = await cartCollection.find(query,{projection:projection}).toArray();
      const classIds = carts.map((cart)=>new ObjectId(cart.classId));
      const query2  = {_id:{$in:classIds}};
      const result = await classesCollection.find(query2).toArray();
      res.send(result);
    })

    //delete cart item
    app.delete('/delete-cart-item/:id',verifyJWT,async(req,res)=>{
      const id = req.params.id;
      const query = {classId:id};
      const result = await cartCollection.deleteOne(query);
      res.send(result)
    })


    //payments routes using strip.com------------------------------------------------------------------------
    app.post("/create-payment-intent", async (req, res) => {
      const {price} = req.body;
      const amount = parseInt(price)*100
      const paymentIntent = await stripe.paymentIntents.create({
        amount :amount,
        currency:"inr",
        payment_method_types:["card"]

      })
      res.send({
        clientSecret:paymentIntent.client_secret
      })
    });

    //post payment infor to db
    app.post("/payment-info",verifyJWT,async(req,res)=>{
      const paymentInfo = req.body;
      const classesId = paymentInfo.classesId;
      const userEmail = paymentInfo.userEmail;
      const singleClassId = req.query.classId;
      let query;
      if(singleClassId){
        query={classId:singleClassId,userMail:userEmail};

      }else{
        query={classId : {$in:classesId}}
        
      }
      const classesQuery = { _id: { $in: classesId.map(id => new ObjectId(id)) } }
      const classes = await classesCollection.find(classesQuery).toArray();
      const newEnrolledData = {
          userEmail: userEmail,
          classesId: classesId.map(id => new ObjectId(id)),
          transactionId: paymentInfo.transactionId,
      }
      const updatedDoc = {
          $set: {
              totalEnrolled: classes.reduce((total, current) => total + current.totalEnrolled, 0) + 1 || 0,
              availableSeats: classes.reduce((total, current) => total + current.availableSeats, 0) - 1 || 0,
          }
      }
      // const updatedInstructor = await userCollection.find()
      const updatedResult = await classesCollection.updateMany(classesQuery, updatedDoc, { upsert: true });
      const enrolledResult = await enrolledCollection.insertOne(newEnrolledData);
      const deletedResult = await cartCollection.deleteMany(query);
      const paymentResult = await paymentCollection.insertOne(paymentInfo);
      res.send({ paymentResult, deletedResult, enrolledResult, updatedResult });
    })

    //get payment history
    app.get('/payment-history/:email', async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
      res.send(result);
    })

  //payment history length
    app.get('/payment-history-length/:email', async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const total = await paymentCollection.countDocuments(query);
      res.send({ total });
    })


    //enrollment routes------------------------------------------------------------------------------------------
    //popular classes out of all
    app.get('/popular_classes', async (req, res) => {
      const result = await classesCollection.find().sort({ totalEnrolled: -1 }).limit(6).toArray();
      res.send(result);
    })

    //popular instructors
    app.get('/popular-instructors', async (req, res) => {
      const pipeline = [
          {
              $group: {
                  _id: "$instructorEmail",
                  totalEnrolled: { $sum: "$totalEnrolled" },
              }
          },
          {
              $lookup: {
                  from: "users",
                  localField: "_id",
                  foreignField: "email",
                  as: "instructor"
              }
          },
          {
            $match:{
              "instructor.role":"instructor",
            }
          },
          {
              $project: {
                  _id: 0,
                  instructor: {
                      $arrayElemAt: ["$instructor", 0]
                  },
                  totalEnrolled: 1
              }
          },
          {
              $sort: {
                  totalEnrolled: -1
              }
          },
          {
              $limit: 6
          }
      ]
      const result = await classesCollection.aggregate(pipeline).toArray();
      res.send(result);

    })


    //admin stats----------------------------------------------------------------------------------------------
    app.get('/admin-stats',verifyJWT,verifyAdmin,  async (req, res) => {
      // Get approved classes and pending classes and instructors 
      const approvedClasses = (await classesCollection.find({ status: 'approved' }).toArray()).length;
      const pendingClasses = (await classesCollection.find({ status: 'pending' }).toArray()).length;
      const instructors = (await usersCollection.find({ role: 'instructor' }).toArray()).length;
      const totalClasses = (await classesCollection.find().toArray()).length;
      const totalEnrolled = (await enrolledCollection.find().toArray()).length;
      // const totalRevenue = await paymentCollection.find().toArray();
      // const totalRevenueAmount = totalRevenue.reduce((total, current) => total + parseInt(current.price), 0);
      const result = {
          approvedClasses,
          pendingClasses,
          instructors,
          totalClasses,
          totalEnrolled,
          // totalRevenueAmount
      }
      res.send(result);

    })

    //get all instructors
    app.get('/instructors', async (req, res) => {
      const result = await usersCollection.find({ role: 'instructor' }).toArray();
      res.send(result);
  })




  app.get('/enrolled-classes/:email',verifyJWT,  async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const pipeline = [
          {
              $match: query
          },
          {
              $lookup: {
                  from: "classes",
                  localField: "classesId",
                  foreignField: "_id",
                  as: "classes"
              }
          },
          {
              $unwind: "$classes"
          },
          {
              $lookup: {
                  from: "users",
                  localField: "classes.instructorEmail",
                  foreignField: "email",
                  as: "instructor"
              }
          },
          {
              $project: {
                  _id: 0,
                  classes: 1,
                  instructor: {
                      $arrayElemAt: ["$instructor", 0]
                  }
              }
          }

      ]
      const result = await enrolledCollection.aggregate(pipeline).toArray();
      // const result = await enrolledCollection.find(query).toArray();
      res.send(result);
    })
    
    //applied for instructors
    app.post('/as-instructor', async (req, res) => {
      const data = req.body;
      const result = await appliedCollection.insertOne(data);
      res.send(result);
    })

    app.get('/applied-instructors/:email',   async (req, res) => {
      const email = req.params.email;
      const result = await appliedCollection.findOne({email});
      res.send(result);
  });





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    app.listen(port,()=>{
      console.log(`Smart Class Hub is listening on ${port}`)
  })
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);
















//connection string mongodb+srv://santhosh171002:<password>@smart-class-hub.gcdebwr.mongodb.net/
     