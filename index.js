const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors');
const compression = require('compression');
const app = express()
const db = require('./queries')

const port = 3000
/**
 * bodyParser = {
  json: {limit: '50mb', extended: true},
  urlencoded: {limit: '50mb', extended: true}
};
 */
app.use(bodyParser.json({
  limit:'50mb',
  extended:true
}))
app.use(
  bodyParser.urlencoded({
    limit: '50mb',
    extended: true,
  })
)
app.use(cors());
app.use('/static',express.static('public'));
app.use(compression());
/*
const allowedOrigins = [
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'http://localhost:8080',
  'http://localhost:8100'
];
const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Origin not allowed by CORS'));
    }
  }
}
// Enable preflight requests for all routes
app.options('*', cors(corsOptions));
app.get('/', cors(corsOptions),(request, response) => {
*/

app.get('/',(request, response) => {
  response.json({ info: 'Node.js, Express, and Postgres API' })
})

app.get('/activities', db.getActivities)
app.get('/activities/:id',db.getActivityById)
app.get('/activities/user/:owner/page/:page',db.getActivityByOwner)
app.get('/activities/simplify/:id',db.getOneActivityById)
app.get('/activities/contacts/user/:owner/page/:page',db.getActivityContacts)
app.post('/activities',db.createActivity)
app.put('/activities/:id',db.updateActivity)
app.delete('/activities/:id', db.deleteActivity)
app.get('/activities/picture/:id', db.getPictureFromActivity)

app.post('/likes',db.likeActivity)
app.get('/likes/:id',db.showLikes)

app.get('/comments/:id',db.getCommentsActitivity)
app.post('/comments',db.commentActivity)
app.delete('/comments/:id',db.delcommentActivity)

app.post('/users',db.createUser)
app.get('/users/:id',db.getUser)
app.get('/users/name/:name',db.getUserByName)
app.get('/users/:id/name/:name',db.getContactsByUser)
app.get('/users/profile/:id',db.getUserProfile)
app.put('/users/:id',db.updateUser)
app.get('/users/:iduser/token/:token',db.updateToken)

app.post('/followers',db.createFollower)
app.get('/followers/followers/:id',db.getFollowersByUser)
app.get('/followers/followeds/:id',db.getFollowedsByUser)
app.delete('/followers/:idfollower/to/:idfollowed', db.deleteFollower)

app.post('/xarpas',db.createXarpa)
app.post('/xarpas/:id/subscribe/:user',db.subscribeXarpa)
app.delete('/xarpas/:id/unsubscribe/:user',db.unsubscribeXarpa)
app.get('/xarpas/user/:id/page/:page',db.getXarpas)
app.get('/xarpas/:id/',db.getXarpaProfile)
app.put('/xarpas/:id',db.updateXarpa)
app.post('/xarpas/search',db.getXarpasByDistance)

app.put('/beacon/:id',db.updateBeacon)
app.post('/beacon/:id',db.messageBeacon)
app.get('/beacon/:id',db.getBeacon)
app.delete('/beacon/:id',db.deleteBeacon)

app.post('/routes',db.createRoute)
app.get('/routes/:id',db.getRouteById)
app.post('/routes/list/:page',db.getRoutes)
app.delete('/routes/:id', db.deleteRoute)
app.get('/routes/who/:id',db.whodidtheRoute)


app.post('/rlikes',db.likeRoute)
app.delete('/rlikes/:idroute/user/:iduser',db.unlikeRoute)
app.get('/rlikes/:id',db.showLikesRoute)

app.get('/rcomments/:id',db.getCommentsRoute)
app.post('/rcomments',db.commentRoute)
app.delete('/rcomments/:id',db.delcommentRoute)

app.get('/news/:id',db.getNewsByUser)



app.listen(process.env.PORT || port, () => {
  console.log(`App running on port ${port}.`)
})