/**
 * Created by eslam on 13.01.16.
 */

/**
 * required modules
 * @type {exports|module.exports}
 */
var fs = require('fs');
var SQLite = require('sqlite3').verbose();
var Lucy = require('slackbots');
var schedule = require('node-schedule');
var winston = require('winston');
var request = require('request');
var json = require('json');
var http = require('http');
var work_dir = '/home/zoobe/lucy/';

winston.add(
    winston.transports.File, {
        filename: work_dir + '/logs/logfile.log',
        level: 'info',
        json: true,
        eol: 'rn', // for Windows, or `eol: ‘n’,` for *NIX OSs
        timestamp: true
    }
);

winston.log('info', 'Start of the bot.');

// create a bot
//slack_token = process.env.SLACK_API_TOKEN;
slack_token = 'xoxb-15921234150-SIhR1hgyvyw3xrxgx3oMtuO1';
var settings = {
    token: slack_token,
    name: 'Lucy'
};

if (settings.token === undefined) {
    console.error("SLACK_TOKEN environment variable is not defined");
}

var lucy = new Lucy(settings);

lucy.dbPath = work_dir +'data/lucy.db';

/**
 * Flag for the environment
 * @type {boolean}
 */
var debug = false;

/**
 * settings for debug and live environment;
 */
if (debug === true) {
    var config = {
        MONDAY: 5,
        TUESDAY: 5,
        WEDNESDAY: 5,
        MONDAYMESSAGE_HOUR: 16,
        MONDAYMESSAGE_MINUTE: 45,
        MONDAYMESSAGE_SECOND: 00,
        TUESDAYSALADMESSAGE_HOUR: 16,
        TUESDAYSALADMESSAGE_MINUTE: 50,
        TUESDAYSALADMESSAGE_SECOND: 05,
        WEDNESDAYSMOOTHIEMESSAGE_HOUR: 16,
        WEDNESDAYSMOOTHIEMESSAGE_MINUTE: 53,
        WEDNESDAYSMOOTHIEMESSAGE_SECOND: 12,
        MONDAYMESSAGEPAYCHECK_HOUR: 16,
        MONDAYMESSAGEPAYCHECK_MINUTE: 47,
        CHAT_ROOM: 'smoothieforlucy',
        USER_TO_REPORT_TO: 'eslam.shala'

    };

}

else {
    var config = {
        MONDAY: 1,
        TUESDAY: 2,
        WEDNESDAY: 3,
        MONDAYMESSAGE_HOUR: 10,
        MONDAYMESSAGE_MINUTE: 00,
        MONDAYMESSAGE_SECOND: 00,
        TUESDAYSALADMESSAGE_HOUR: 12,
        TUESDAYSALADMESSAGE_MINUTE: 30,
        TUESDAYSALADMESSAGE_SECOND: 09,
        WEDNESDAYSMOOTHIEMESSAGE_HOUR: 09,
        WEDNESDAYSMOOTHIEMESSAGE_MINUTE: 30,
        WEDNESDAYSMOOTHIEMESSAGE_SECOND: 17,
        MONDAYMESSAGEPAYCHECK_HOUR: 11,
        MONDAYMESSAGEPAYCHECK_MINUTE: 00,
        CHAT_ROOM: 'smoothiesandsalads',
        USER_TO_REPORT_TO: 'smonicats'

    };
}

/**
 * On start callback, called when lucy connects to Slack server
 */
lucy.on('start', function () {
    winston.log('info', 'on start method');
    lucy._connectDb();
    lucy._firstRunCheck();
    lucy._mondayMessage();
    //lucy._feedbackToMonica();
    lucy._tuesdaySaladMessage();
    lucy._wednesdaySmoothieMessage();
    lucy._payCheck();

});

/**
 * On message callback, called when a message (of any type) is detected with the real time messaging API
 */
lucy.on('message', function (message) {
    winston.log('info', 'on message method.');
    var currentDay = new Date().getDay(); // returns an integer, 0 for sun, 1 for mon, 2 for tue
    if (this._isChatMessage(message) &&
        this._isDirectConversationToLucy(message) && !this._isFromLucyBot(message)) { //    check if the day is monday
        // @TODO: change the 3 into 1; where 3 is for wednesday and 1 is for monday
        winston.log('info', 'is chat message and a direct conv to lucy and not from lucy.');
        //console.log(message);
        this._inOrOutForSmoothie(message, currentDay);

    }

});


/**
 * Check if it's the first time for the bot to run. If so, it sends a welcome message to the Channel.
 * @private
 */
lucy._firstRunCheck = function () {
    winston.log('info', 'this is my first run check.');
    var self = this;
    self.db.get('SELECT val FROM info WHERE name = "lastrun" LIMIT 1', function (err, record) {
        if (err) {
            winston.log('error', 'database error' + err);
            return console.error('DATABASE ERROR:', err);
        }

        var currentTime = (new Date()).toJSON();

        // this is a first run
        if (!record) {
            winston.log('info', 'Not a record');
            self._welcomeMessage();
            return self.db.run('INSERT INTO info(name, val) VALUES("lastrun", ?)', currentTime);
        }

        // updates with new last running time
        self.db.run('UPDATE info SET val = ? WHERE name = "lastrun"', currentTime);
    });
};

/**
 * Sends a welcome message to the channel
 * @private
 */
lucy._welcomeMessage = function () {
    lucy.postMessageToChannel(config.CHAT_ROOM, 'My name is Lucy and it is super nice to meet all of you on my first day! I am supposed to help Monica with the Smoothies and Salad. However, there is no limit to what I can do. Hopefully, one day I will be able to deliver coffee to your very own desk.', {as_user: true});
};


/**
 * Opens connection to the database
 * @private
 */
lucy._connectDb = function () {
    if (!fs.existsSync(this.dbPath)) {
        console.error('Database path ' + '"' + this.dbPath + '" does not exists or it\'s not readable.');
        process.exit(1);
    }

    this.db = new SQLite.Database(this.dbPath);
    this._setupDb(this.db);
};

/**
 * Initialize the database tables for the first run
 * @param db
 * @private
 */
lucy._setupDb = function (db) {
    db.serialize(function () {
        console.log("creating table");
        db.run('CREATE TABLE IF NOT EXISTS info (name TEXT PRIMARY KEY, val TEXT DEFAULT NULL)');
        db.run('CREATE TABLE IF NOT EXISTS saladrecord(id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, username TEXT NOT NULL, date TEXT NOT NULL, interested INTEGER DEFAULT NULL, paid INTEGER DEFAULT NULL)');
        db.run('CREATE TABLE IF NOT EXISTS talktolucy(id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, username TEXT NOT NULL, date TEXT NOT NULL, text TEXT)');
        console.log("table created");
    })
};

/**
 * Checks if the username of the message is Lucy
 * @param message
 * @returns {boolean}
 * @private
 */
lucy._isFromLucyBot = function (message) {
    return message.username === 'Lucy' || message.user === lucy.self.id;
};


/**
 * checks if the username of the message is Eslam
 * @param message
 * @returns {boolean}
 * @private
 */

lucy._isFromEslam = function (message) {
    var users = lucy.getUsers();
    var user = this.getUserById(message.user,users);
    return user.name === 'eslam.shala';
};

/**
 * Checks if the User is the Bot/Lucy
 * @param user
 * @returns {boolean}
 * @private
 */
lucy._userIsLucy = function (user) {
    return user.name === 'lucy';
};

/**
 * Util function to check if a given real time message object represents a chat message
 * @param message
 * @returns {boolean}
 * @private
 */
lucy._isChatMessage = function (message) {
    return message.type === 'message' && Boolean(message.text);
};

/**
 * Util function ot check if a given real time message is being sent directly to Lucy
 * @param message
 * @returns {boolean}
 * @private
 */
lucy._isDirectConversationToLucy = function (message) {
    return typeof message.channel === 'string' &&
        message.channel[0] === 'D';
};

/**
 * Check if someone is mentioning Lucy in any of the chats
 * @param message
 * @returns {boolean}
 * @private
 */
lucy._isMentioningLucy = function (message) {
    return message.text.toLowerCase().indexOf('lucy') > -1
};


//@TODO: create a settings file for debug and live mode where in debug the channel should be 'smoothieforlucy' and in live it should be 'smoothiesandsalads'
/**
 * Get users in the S&S channel.
 * @param channels
 * @returns {*|Array}
 */
lucy.getSSUsers = function (channels) {
    var index;
    for (var i = 0; i < channels._value.channels.length; i++) {
        if (channels._value.channels[i].name === config.CHAT_ROOM) {
            index = i;
            break;
        }
    }

    var result = channels._value.channels[index].members;
    if (result === undefined) {
        console.error("The bot is not in the specified room");
        process.exit(1);
        process.exit(1);
    }

    return result;
};

/**
 * Gets user details by providing his/her ID
 * @param userId
 * @param users
 * @returns {*}
 */
lucy.getUserById = function (userId, users) {
    var index;
    for (var i = 0; i < users._value.members.length; i++) {
        if (userId === users._value.members[i].id) {
            index = i;
            break;
        }
    }

    var result = users._value.members[index];

    return result;
};

/**
 * Checks if user paid or not based on a schedule
 * @private
 */
lucy._payCheck = function () {
    var payCheckSchedule = new schedule.RecurrenceRule();
    payCheckSchedule.second = config.MONDAYMESSAGE_SECOND;
    payCheckSchedule.minute = config.MONDAYMESSAGEPAYCHECK_MINUTE;
    payCheckSchedule.dayOfWeek = config.MONDAY;
    payCheckSchedule.hour = [config.MONDAYMESSAGEPAYCHECK_HOUR, new schedule.Range(10, 15)];
    schedule.scheduleJob(payCheckSchedule, function () {
        var date = new Date();
        var currentDate = date.getDate().toString() + date.getMonth().toString() + date.getFullYear().toString();


        lucy.db.each('SELECT id, username, interested, paid FROM saladrecord WHERE date=\'' + currentDate + '\'', function (err, record) {
            if (err) {
                return console.error('DATABASE ERROR: ' + err);
            }
            if (record.interested === 1 && record.paid === null) {
                lucy.postMessageToUser(record.username, "Did you pay Monica the S&S money?", {as_user: true});
            }
        });

    });
};


/**
 * Sends a msgs to users in a channel asking if they are interested to register for S&S this week.
 * @private
 */
lucy._mondayMessage = function () {

    //@TODO: Add Berlin TimeZone
    var mondaySchedule = new schedule.RecurrenceRule();
    // schedule the message for mondays at 9:45am
    mondaySchedule.second = config.MONDAYMESSAGE_SECOND;
    mondaySchedule.minute = config.MONDAYMESSAGE_MINUTE;
    mondaySchedule.hour = config.MONDAYMESSAGE_HOUR;
    mondaySchedule.dayOfWeek = config.MONDAY; // 1 is for mondays
    schedule.scheduleJob(mondaySchedule, function () {
        var users = lucy.getUsers();
        var channels = lucy.getChannels();
        var channelUsers = lucy.getSSUsers(channels);
        var date = new Date();
        var currentDate = date.getDate().toString() + date.getMonth().toString() + date.getFullYear().toString();
        for (var i = 0; i < channelUsers.length; i++) {
            var user = lucy.getUserById(channelUsers[i], users);
            if (!lucy._userIsLucy(user)) {

                //  1 - create a DB entry with the username
                var insertStatement = 'INSERT INTO saladrecord(username, date) VALUES ("' + user.name + '", ' + '"' + currentDate + '"' + ');';
                lucy.db.run(insertStatement);
                //  2 - send a private message to each user if they want to register for SS this week
                var messageToUser = "Good morning " + user.name + "! \n Would you like to register for the S&S this week? :-) you can answer with yes/no";
                lucy.postMessageToUser(user.name, messageToUser, {as_user: true});

            }
        }
    });
};

/**
 * Checks if user wants to join or not join a
 * @param message
 * @private
 */
lucy._inOrOutForSmoothie = function (message, currentDay) {
    var userId = message.user;
    var users = lucy.getUsers();
    var user = this.getUserById(userId, users);
    var text = message.text.toLowerCase();
    // to trim whitespaces, \s regex for whiespace, g global flag meaning all \s, + is faster as all string
    //space characters are replace with empty string instead of character by character.
    text = text.replace(/\s+/g, '');
    //    check if the message is yes, then update the DB record and tell him to pay monica now
    if ((text === 'yes' || text === "ja" || text === "yea" || text === "yeah" || text === "ye" || text === "si") && (
        currentDay === config.MONDAY)) {

        // update database
        // 1- get the latest entry for that user
        // 2- update the the interested part to 1 instead of null
        this.db.get('SELECT id, date, interested, paid FROM saladrecord WHERE username=' + '\'' + user.name + '\' ORDER BY id DESC LIMIT 1', function (err, record) {
            if (err) {

                return console.error("DATABASE ERROR: " + err);
            }
            //console.log(record.paid);
            if (record.interested === null && record.paid === null) {
                lucy.postMessageToUser(user.name, "Cool, I am adding you now to the S&S sheet for this week. For now, please pay Monica :-)", {as_user: true});
                lucy.db.run('UPDATE saladrecord SET interested = 1 WHERE id = ?', record.id);
                lucy.postMessageToUser(config.USER_TO_REPORT_TO, user.name + " is interested in salad this week!", {as_user: true});
            }
            else if (record.interested === 1 && record.paid === null) {
                lucy.postMessageToUser(user.name, "Awesome! Thank you. Have a great work day!", {as_user: true});
                lucy.db.run('UPDATE saladrecord SET paid = 1 WHERE id = ?', record.id);
            }

        });
    }

    else if ((text === 'no' || text === 'nein' || text === 'nop' || text === 'nope') && (
        currentDay === config.MONDAY)) {
        // user answered no;
        // update database
        // 1- get the latest entry for that user
        // 2- update the the interested part to 0 instead of null
        this.db.get('SELECT id, date, interested FROM saladrecord WHERE username=' + '\'' + user.name + '\' ORDER BY id DESC LIMIT 1', function (err, record) {
            if (err) {
                return console.error("DATABASE ERROR: " + err);
            }

            if (record.interested !== 1) {
                lucy.postMessageToUser(user.name, "That's sad :-( We would really love that you would join us.", {as_user: true});
                lucy.db.run('UPDATE saladrecord SET interested = 0 WHERE id = ?', record.id);
            }

            if (record.interested === 0) {
                lucy.postMessageToUser(user.name, "Ok :-)", {as_user: true})
            }

            if (record.interested === 1) {
                lucy.postMessageToUser(user.name, "Then please proceed with the payment to Monica :-)", {as_user: true});
            }
        });

    }

    else if (text === 'hi' || text === 'hii') {

        this._handleHiMsg(user);
    }

    else if (text === 'howareyou?' || text === 'howru?' || text.indexOf('howareyou') > -1 || text.indexOf('howru') > -1 || text.indexOf('hwru') > -1) {
        this._handleHowAreYouMsg(user);
    }

    else if (text.indexOf('fine') > -1 || text.indexOf('good') > -1 || text.indexOf('ok') > -1) {
        this._handleGoodMsg(user);
    }


    else if (text === 'door') {
        http.get({
            host: '192.168.2.236',
            port: 8080,
            path: '/',
            method: 'GET'
        }, function(res) {
            lucy.postMessageToUser(user.name, "Opening it for you! ;-)", {as_user: true});
        })
    }

    else {
        this._handleOtherMsg(user, text);
    }

};

/**
 * helper method to handle unknown messages
 * @param user
 * @param text
 * @private
 */
lucy._handleOtherMsg = function (user, text) {
    var date = new Date();
    var currentDate = date.getDate().toString() + date.getMonth().toString() + date.getFullYear().toString();
    var insertStatement = 'INSERT INTO talktolucy(username, date, text) VALUES ("' + user.name + '", ' + '"' + currentDate + '",' + '"' + text + '"' + ');';
    lucy.db.run(insertStatement);
    lucy.postMessageToUser(user.name, "I did not understand what you are trying to say. But I am still learning. However, feel free to talk!", {as_user: true});

};


/**
 * helper method to handle Good msg
 * @param user
 * @private
 */
lucy._handleGoodMsg = function (user) {

    lucy.postMessageToUser(user.name, ":-)", {as_user: true});
};

/**
 * helper method to handle 'how are you' messages
 * @param user
 * @private
 */
lucy._handleHowAreYouMsg = function (user) {

    lucy.postMessageToUser(user.name, "Unfortunately, I am a bot. I do not feel at all. But since you are reading this message, it means that servers are running in a good way.", {as_user: true});
};

/**
 * helper method to handle the hi messages
 * @param user
 * @private
 */
lucy._handleHiMsg = function (user) {
    //console.log(user);
    lucy.postMessageToUser(user.name, "Hi " + user.name + ", How's everything?", {as_user: true});
};

/**
 * Sends channel remined msg for ready Salad
 * @private
 */
lucy._tuesdaySaladMessage = function () {
    var tuesdaySchedule = new schedule.RecurrenceRule();
    // schedule the message for Tuesday at 1:00pm
    tuesdaySchedule.second = config.TUESDAYSALADMESSAGE_SECOND;
    tuesdaySchedule.minute = config.TUESDAYSALADMESSAGE_MINUTE;
    tuesdaySchedule.hour = config.TUESDAYSALADMESSAGE_HOUR;
    tuesdaySchedule.dayOfWeek = config.TUESDAY; // 1 is for mondays
    schedule.scheduleJob(tuesdaySchedule, function () {
        lucy.postMessageToChannel(config.CHAT_ROOM, "@channel: Salad is ready! Run to the Kitchen!", {as_user: true});
    });
};

/**
 * Sends channel reminder msg for ready smoothie
 * @private
 */
lucy._wednesdaySmoothieMessage = function () {
    var wednesdaySchedule = new schedule.RecurrenceRule();
    wednesdaySchedule.second = config.WEDNESDAYSMOOTHIEMESSAGE_SECOND;
    wednesdaySchedule.minute = config.WEDNESDAYSMOOTHIEMESSAGE_MINUTE;
    wednesdaySchedule.hour = config.WEDNESDAYSMOOTHIEMESSAGE_HOUR;
    wednesdaySchedule.dayOfWeek = config.WEDNESDAY; // 1 is for mondays
    schedule.scheduleJob(wednesdaySchedule, function () {
        lucy.postMessageToChannel(config.CHAT_ROOM, "@channel: Smoothies are ready! Run to the Kitchen!", {as_user: true});
    });
};
