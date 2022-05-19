/**
 *    Copyright 2018 Amazon.com, Inc. or its affiliates
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

// use this command -- node backend -c yx9mfmivn2ctwiaa3neka00fjmn8vt -s E30jPbbLAfHMRoYNZzK+7zUcKdWzVRIdttTQ442PFXw= -a jo2p6mzsa3u1vt1cdc5k9nibqh5dt1 -o 43658519 

// batching and throttling extension messages
// fix restarting giveaways

const fs = require('fs');
const path = require('path');
const Boom = require('boom');
const color = require('color');
const ext = require('commander');
const jsonwebtoken = require('jsonwebtoken');
const axios = require('axios');

const express = require('express');
var cors = require('cors')
const app = express();
const port = 8081;
app.use(cors());
app.use(express.json());



// The developer rig uses self-signed certificates.  Node doesn't accept them
// by default.  Do not use this in production.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Use verbose logging during development.  Set this to false for production.
const verboseLogging = true;
const verboseLog = verboseLogging ? console.log.bind(console) : () => { };

// Service state variables
const initialColor = color('#6441A4');      // super important; bleedPurple, etc.
const serverTokenDurationSec = 30;          // our tokens for pubsub expire after 30 seconds
const userCooldownMs = 1000;                // maximum input rate per user to prevent bot abuse
const userCooldownClearIntervalMs = 60000;  // interval to reset our tracking object
const channelCooldownMs = 1000;             // maximum broadcast rate per channel
const bearerPrefix = 'Bearer ';             // HTTP authorization headers have this prefix
const colorWheelRotation = 30;
const channelColors = {};
const channelCooldowns = {};                // rate limit compliance
let userCooldowns = {};                     // spam prevention

const STRINGS = {
  secretEnv: usingValue('secret'),
  clientIdEnv: usingValue('client-id'),
  ownerIdEnv: usingValue('owner-id'),
  serverStarted: 'Server running at %s',
  secretMissing: missingValue('secret', 'EXT_SECRET'),
  clientIdMissing: missingValue('client ID', 'EXT_CLIENT_ID'),
  ownerIdMissing: missingValue('owner ID', 'EXT_OWNER_ID'),
  messageSendError: 'Error sending message to channel %s: %s',
  pubsubResponse: 'Message to c:%s returned %s',
  cyclingColor: 'Cycling color for c:%s on behalf of u:%s',
  colorBroadcast: 'Broadcasting color %s for c:%s',
  sendColor: 'Sending color %s to c:%s',
  cooldown: 'Please wait before clicking again',
  invalidAuthHeader: 'Invalid authorization header',
  invalidJwt: 'Invalid JWT',
};

ext.
  version(require('./package.json').version).
  option('-s, --secret <secret>', 'Extension secret').
  option('-a, --app-secret <appSecret>', 'App Secret').
  option('-c, --client-id <client_id>', 'Extension client ID').
  option('-o, --owner-id <owner_id>', 'Extension owner ID').
  parse(process.argv);

const ownerId = getOption('ownerId', 'EXT_OWNER_ID');
const secret = Buffer.from(getOption('secret', 'EXT_SECRET'), 'base64');
const clientId = getOption('clientId', 'EXT_CLIENT_ID');
const token = getOption('appSecret', 'EXT_APP_SECRET')
let accessToken = '';

const serverPathRoot = path.resolve(__dirname, '..', 'conf', 'server');
if (fs.existsSync(serverPathRoot + '.crt') && fs.existsSync(serverPathRoot + '.key')) {
  // serverOptions.tls = {
  //   // If you need a certificate, execute "npm run cert".
  //   cert: fs.readFileSync(serverPathRoot + '.crt'),
  //   key: fs.readFileSync(serverPathRoot + '.key'),
  // };
}

/**
 * TODO: store past giveaways in twitch configuration settings.
 */
const giveaways = [];

(async () => {
  getServerAccessToken().then(res => {
    // console.log(res);
    accessToken = res.data.access_token;
  }).catch(err => {
    console.log(err);
  })

  app.get('/giveaway/query', (req, res) => {
    console.log(JSON.stringify(req.headers));
    const payload = verifyAndDecode(req.headers.authorization);
    
    const { channel_id: channelId, opaque_user_id: opaqueUserId, user_id: userId } = payload;

    console.log(channelId);

    giveaway = giveaways.find(giveaway => giveaway.channelId === channelId);
    
    res.send({
      inGiveaway: !!giveaway && giveaway.entries.some(entry => entry.userId === userId),
      giveawayActive: giveaway?.isActive,
      numberOfEntries: giveaway?.entries?.filter(entry => entry.userId === userId).length ?? 0,
      maxEntryAmount: giveaway?.maxEntryAmount,
      totalEntries: giveaway?.entries?.length,
      winners: giveaway?.winners ?? []

    });
  });

  app.post('/giveaway/join', async (req, res) => {
    const payload = verifyAndDecode(req.headers.authorization);
    const { channel_id: channelId, opaque_user_id: opaqueUserId, user_id: userId } = payload;
    if (opaqueUserId && opaqueUserId[0] === "A") { // don't want TRANSIENT users to join...
      verboseLog('you\'re not supposed to be here!');
      res.status(401).send('Sorry, gotta be logged in to join.');
      return;
    } 

    const giveawayId = giveaways.findIndex(giveaway => giveaway.channelId === channelId && giveaway.isActive);

    if (giveawayId === -1) {
      res.status(404).send('no active giveaway found for this channel');
      return;
    }

    if (giveaways[giveawayId].entries.filter(entry => entry.userId == userId).length >= giveaways[giveawayId].maxEntryAmount) {
      res.status(400).send(`no additional entries may be entered for user ${userId}`);
      return;
    }

    const twitchResponse = await getUser(userId, channelId)

    const entry = {};

    const displayName = twitchResponse?.data?.data[0]?.display_name ?? twitchResponse;
    entry.userId = userId;
    entry.userName = displayName;
    giveaways[giveawayId].entries.push(entry);
    giveaways[giveawayId].entriesToProcess.push(entry);

      
      
    console.log('sending message');
    const objToConvert = JSON.stringify({event: 'user-entered', enteredUser: displayName})
    console.log(objToConvert);

    try {
      await broadcastMessageToChannel(giveaways[giveawayId].channelId, objToConvert);

    } catch(err) {
      console.log(STRINGS.messageSendError, channelId, err);
    };

    verboseLog(STRINGS.pubsubResponse, channelId, res.statusCode);
    res.send();
  })

  // Broadaster Query for giveaway
  app.get('/giveaway/broadcasterQuery', (req, res) => {
    const payload = verifyAndDecode(req.headers.authorization);
    const { channel_id: channelId, opaque_user_id: opaqueUserId, role: role} = payload;

    console.log('loading broadcaster dashboard');

    if (role !== 'broadcaster') {
      res.status(401).send('Must be broadcaster for channel');
      return;
    }

    const giveaway = giveaways.find(giveaway => giveaway.channelId === channelId);
    if (!giveaway) {
      res.status(404).send('no giveaways found');
    } else {
      res.send(JSON.stringify({
          channelId: giveaway.channelId,
          broadcasterOpaqueId: giveaway.broadcasterOpaqueId,
          userList: calculateGiveawayEntries(giveaway.entries),
          isActive: giveaway.isActive,
          winners: giveaway.winners
      }));
    }
  })

  // Start the Giveaway
  app.post('/giveaway/startGiveaway', async (req, res) => {
    const payload = verifyAndDecode(req.headers.authorization);
    const { channel_id: channelId, opaque_user_id: opaqueUserId, role: role, user_id: userId } = payload;
    const config = req.body.config;

    console.log(`starting giveaway for ${channelId}`);

    if (role !== 'broadcaster') {
      console.log('must be the broadcaster for channel');
      res.status(401).send('Must be broadcaster for channel');
      return;
    }

    const giveaway = {
      channelId: channelId,
      broadcasterOpaqueId: opaqueUserId,
      broadcasterUserId: userId,
      entries: [],
      maxEntryAmount: config.maxEntryAmount,
      entriesToProcess: [],
      winners: [],
      isActive: true
    }

    if (giveaways.find(x => x.channelId === channelId && x.isActive) != null) {
      console.log('active giveaway already exists!')
      res.status(409).send('giveaway already exists! you must cancel your other giveaway before starting a new one.')
      return;
    }
    try {
      await broadcastMessageToChannel(giveaway.channelId, JSON.stringify({event: 'giveaway-start', config: {maxEntryAmount: giveaway.maxEntryAmount}}))
    }
    catch (err) {
      verboseLog(err);
      res.status(500).send(`Couldn't send broadcast`);
      return;
    }

    let giveawayIndex = giveaways.findIndex(x => x.channelId === channelId)
    if (giveawayIndex > -1) {
      giveaways[giveawayIndex] = giveaway;
    } else {
      giveaways.push(giveaway);
    }
    res.send();
  });

  app.put('/giveaway/cancelGiveaway', async (req, res) => {
    const payload = verifyAndDecode(req.headers.authorization);
    const { channel_id: channelId, opaque_user_id: opaqueUserId, role: role} = payload;

    verboseLog('attempting to cancel a giveaway...')

    if (role !== 'broadcaster') {
      verboseLog('Must be broadcaster for channel');
      res.status(401).send('Must be broadcaster for channel');
      return;
    }

    const giveawayId = giveaways.findIndex(giveaway => giveaway.channelId === channelId && giveaway.isActive == true);
    if (giveawayId === -1) {
      verboseLog('no active giveaway found for channel');
      res.status(401).send('no active giveaway found for channel');
      return
    }

    giveaways[giveawayId].isActive = false;

    await broadcastMessageToChannel(channelId, JSON.stringify({event: 'giveaway-cancelled'}))

    verboseLog(`that's the last pick. ending this giveaway...`)
    giveaways[giveawayId].isActive = false;
    giveaways[giveawayId].entries = [];
    res.send();

  });

  app.put('/giveaway/endGiveaway', async (req, res) => {
    const payload = verifyAndDecode(req.headers.authorization);
    const { channel_id: channelId, role: role} = payload;

    console.log(`starting giveaway for ${channelId}`);

    if (role !== 'broadcaster') {
      console.log('must be the broadcaster for channel');
      res.status(401).send('Must be broadcaster for channel');
      return;
    }

    const giveawayId = giveaways.findIndex(giveaway => giveaway.channelId === channelId && giveaway.isActive == true);
    if (giveawayId === -1) {
      verboseLog('no active giveaway found for channel');
      res.status(401).send('no active giveaway found for channel');
      return
    }

    // eventually, only conditionally emit this event if there are no more winners to pick.
    await broadcastMessageToChannel(channelId, JSON.stringify({event: 'giveaway-complete'}))

    verboseLog(`that's the last pick. ending this giveaway...`);
    giveaways[giveawayId].isActive = false;
    giveaways[giveawayId].entries = [];

    res.send();
  });
  

  app.put('/giveaway/getWinner', async (req, res) => {
    verboseLog('getting a winner...');
    const payload = verifyAndDecode(req.headers.authorization);
    const { channel_id: channelId, opaque_user_id: opaqueUserId, role: role} = payload;

    if (role !== 'broadcaster') {
      verboseLog('Must be broadcaster for channel');
      res.status(401).send('Must be broadcaster for channel');
      return;
    }

    const giveawayId = giveaways.findIndex(giveaway => giveaway.channelId === channelId && giveaway.isActive == true);
    if (giveawayId === -1) {
      verboseLog('no giveaway found for channel');
      res.status(401).send('no giveaway found for channel');
      return
    }

    const count = giveaways[giveawayId].entries.length;

    if (count === 0) {
      giveaways[giveawayId].isActive = false;
      res.status(400).send('no entries found for this giveaway')
      return;
    }

    verboseLog(count);
    const luckyWinner = Math.floor(Math.random() * count);

    verboseLog(`picked a winner! ticket# ${luckyWinner}`);
    giveaways[giveawayId].winners.push(giveaways[giveawayId].entries[luckyWinner]);
    const objToSerialize = {event: 'declare-winner', winningEntry: giveaways[giveawayId].entries[luckyWinner]}
    const serializedJson = JSON.stringify(objToSerialize);

    // clear out all entries from that viewer
    winner = giveaways[giveawayId].entries[luckyWinner];
    giveaways[giveawayId].entries = giveaways[giveawayId].entries.filter(entry => entry.userId !== winner.userId);




    /**
     *  Two kinds of equal symbols.
     * 1) Assignment Operator                   " = "         a = 10; b = 20; a = b; a = 20;
     * 2) Equality Operator                     " == "        a = 10; b = 20; a == b; false.
     * 
     * Two additional operations:
     * 1) Negation operator.                    " ! "         a = true;  !a  >>> false
     * 2) strict typing equality operator       " === "       "text" === "text" >>> true
     *                                                        "10" === 10 >>> false
     * COMBINE THEM                             " !== "       "10" !== 10 >>> true
     */


    await broadcastMessageToChannel(channelId, serializedJson)
    res.send(JSON.stringify(giveaways[giveawayId]));
  })

  app.listen(port, () => {
    console.log(`listening on port ${port}`);
  })

  setInterval(() => { userCooldowns = {}; }, userCooldownClearIntervalMs);

  setInterval(announceTotalEntries, 3000);

  
})();


function announceTotalEntries() {
  // for every active giveaway we're servicing
    // count the number of entries in the giveaway
    // announce that number to everyone in the channel.
  giveaways.forEach(async giveaway => {
    if (!giveaway.isActive) return;

    const channelId = giveaway.channelId;
    const entryCount = giveaway.entries.length;
    const serializedJson = JSON.stringify({event: 'announce-count', count: entryCount});
    await broadcastMessageToChannel(channelId, serializedJson);
  })
}

function usingValue(name) {
  return `Using environment variable for ${name}`;
}

function missingValue(name, variable) {
  const option = name.charAt(0);
  return `Extension ${name} required.\nUse argument "-${option} <${name}>" or environment variable "${variable}".`;
}

// Get options from the command line or the environment.
function getOption(optionName, environmentName) {
  const option = (() => {
    if (ext[optionName]) {
      return ext[optionName];
    } else if (process.env[environmentName]) {
      verboseLog(STRINGS[optionName + 'Env']);
      return process.env[environmentName];
    }
    verboseLog(STRINGS[optionName + 'Missing']);
    process.exit(1);
  })();
  console.log(`Using "${option}" for ${optionName}`);
  return option;
}

// Verify the header and the enclosed JWT.
function verifyAndDecode(header) {
  if (header.startsWith(bearerPrefix)) {
    try {
      const token = header.substring(bearerPrefix.length);
      return jsonwebtoken.verify(token, secret, { algorithms: ['HS256'] });
    }
    catch (ex) {
      throw Boom.unauthorized(STRINGS.invalidJwt);
    }
  }
  throw Boom.unauthorized(STRINGS.invalidAuthHeader);
}

function broadcastMessageToChannel(channelId , message) {
    // Set the HTTP headers required by the Twitch API.
    const headers = {
      'Client-Id': clientId,
      'Content-Type': 'application/json',
      'Authorization': bearerPrefix + makeHelixServerToken(channelId, 'broadcast'),
    };
  
    // Create the POST body for the Twitch API request.
    const body = JSON.stringify({
      message: message,
      broadcaster_id: ownerId,
      target: ['broadcast'],
    });
  
    // Send the broadcast request to the Twitch API.
    // verboseLog(userId, channelId);
    return axios.post(
      `https://api.twitch.tv/helix/extensions/pubsub`, body, {headers: headers}
     );
}

function sendWhisper(channelId, opaqueUserId, message) {
  // Set the HTTP headers required by the Twitch API.
  const headers = {
    'Client-Id': clientId,
    'Content-Type': 'application/json',
    'Authorization': bearerPrefix + makeServerToken(channelId),
  };

  // Create the POST body for the Twitch API request.
  const body = JSON.stringify({
    content_type: 'application/json',
    message: message,
    targets: [`whisper-${opaqueUserId}`],
  });

  // Send the broadcast request to the Twitch API.
  verboseLog(`sending a message to ${opaqueUserId} user and ${channelId} channel, with message of ${message}`);
  return axios.post(
    `https://api.twitch.tv/helix/extensions/message/${channelId}`, body, {
      headers: headers
    })
}

function calculateGiveawayEntries(entries) {
  const giveawayList = {}
  for (let entry of entries) {
    if (!giveawayList[entry.userName]) {
      giveawayList[entry.userName] = 1
    } else {
      giveawayList[entry.userName] += 1;
    }
  }
  return giveawayList;
}

// Create and return a JWT for use by this service.
function makeServerToken(channelId) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + serverTokenDurationSec,
    channel_id: channelId,
    user_id: ownerId, // extension owner ID for the call to Twitch PubSub
    role: 'external',
    pubsub_perms: {
      send: ['*'],
    },
  };
  return jsonwebtoken.sign(payload, secret, { algorithm: 'HS256' });
}

// Create and return a JWT for use by this service.
function makeHelixServerToken(channelId ,pubSubPerm) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + serverTokenDurationSec,
    channel_id: channelId,
    user_id: ownerId, // extension owner ID for the call to Twitch PubSub
    role: 'external',
    pubsub_perms: {
      send: [pubSubPerm],
    },
  };
  // is this right? https://dev.twitch.tv/docs/api/reference#send-extension-pubsub-message
  return jsonwebtoken.sign(payload, secret);
}

function getServerAccessToken() {
  console.log(secret.toString());
  return axios.post(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${token}&grant_type=client_credentials`)
}

const cachedUsers = {};
function getUser(userId, channelId) {
  if (!!cachedUsers[userId]) {
    return Promise.resolve(cachedUsers[userId]);
  }

  return axios.get('https://api.twitch.tv/helix/users', {
    headers: {
      'Client-ID': clientId,
      'Authorization': bearerPrefix + accessToken,
    },
    params: {
      id: userId
    }
  })
  .then(res => {
    cachedUsers[userId] = res.data.data[0].display_name;
    return res;
    }
  );
}

// TODO: tie this by-user cooldown so nobody can abuse server
function userIsInCooldown(opaqueUserId) {
  // Check if the user is in cool-down.
  const cooldown = userCooldowns[opaqueUserId];
  const now = Date.now();
  if (cooldown && cooldown > now) {
    return true;
  }

  // Voting extensions must also track per-user votes to prevent skew.
  userCooldowns[opaqueUserId] = now + userCooldownMs;
  return false;
}
