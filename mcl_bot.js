/**
 * Configure command
 */
try {
    var jsdom            = require('jsdom');
    var unirest          = require('unirest');
    var $                = require('jquery');
    var fs               = require('fs');
    var token            = fs.readFileSync('./.token', {"encoding": "utf8"});
    var BASE_URL         = "https://api.telegram.org/bot:secret:/".replace(":secret:", token).replace(/(\n|\r)+/, '');
    var POLLING_URL      = BASE_URL + "getUpdates?offset=:offset:&timeout=60";
    var SEND_MESSAGE_URL = BASE_URL + "sendMessage";
    var menuText         = new Array(6);
    var dateOfRefresh    = undefined;
} catch (err) {
    console.error('A dependency error occurred: ' + err.message);
    console.error('RTFM (README.md)');
    process.exit(1);
}

/**
 * Infinite recursive callback loop
 *
 * @param offset
 */
function poll(offset)
{
    var url;
    if (offset == -1)
        url = POLLING_URL.replace("offset=:offset:&", '');
    else
        url = POLLING_URL.replace(":offset:", offset);

    unirest
        .get(url)
        .end(function (response)
        {
            var body = response.raw_body;
            if (response.status == 200)
            {
                var jsonData = JSON.parse(body);
                var result = jsonData.result;
                var max_offset = -1;
                //console.log("Got result!");
                if (result.length > 0)
                {
                    for (var i in result)
                    {
                        try
                        {
                            if ((result[i].message.date * 1000) <= (new Date().getTime() - 90 * 1000))
                            {
                                console.log("Found a message in queue older than 90s..skipping.");
                                continue;
                            }

                            runCommand(result[i].message);
                        }
                        catch (err)
                        {
                            console.log("error occured: " + err.message);
                        }
                    }
                    max_offset = parseInt(result[result.length - 1].update_id) + 1; // update max offset
                }
                poll(max_offset);
            }
        });
}

/**
 * @param message
 */
var capsMe = function (message)
{
    var caps = message.text.toUpperCase();
    var answer = {
        chat_id: message.chat.id,
        text: "You told me to do something, so I took your input and made it all caps. Look: " + caps
    };

    unirest
        .post(SEND_MESSAGE_URL)
        .send(answer)
        .end(function (response)
        {
            if (response.status == 200) console.log("Successfully sent message to " + message.chat.id);
        });
};

/**
 * @param message
 */
function sendMenu(message)
{
    var cached = true;
    for (var i = 1; i < 6; i++)
    {   //check if menutext exists (except index 0 (daily dishes) which might be null anyways)
        if (menuText[i] == null || menuText[i].length <= 0)
        {
            cached = false;
            break;
        }
    }

    if (cached == false || dateOfRefresh < new Date().getWeekNumber())
    {
        console.log("No cached data... refreshing menu");
        refreshCache(message);
    }
    else
        {
        console.log("cached data valid. last refresh @ week no. " + dateOfRefresh);
        sendMenuText(menuText, message);
    }
}

/**
 * @param window
 */
function parseMenu(window)
{
    var id = 0;
    var menu = new Array(6);

    console.log("Parsing speiseplan..");
    $ = require('jquery')(window);

    $("table tbody").each(function ()    // 5 bodies, 6 categories
    {
        var arrayOfThisDay = [];
        var rows = $(this).find('tr');

        rows.each(function ()  // x rows
        {
            var arrayOfThisRow = [];

            var tableData = $(this).find('td');

            if (tableData.length > 0)
            {
                tableData.each(function ()
                {
                    //arrayOfThisRow.push($(this).text());
                    arrayOfThisRow.push($(this).html());    //html to keep formatting
                });
                arrayOfThisDay.push(arrayOfThisRow);
            }

            if ($(this).find('th').length > 0)
            {   //header found -> category change
                if (id == 0)
                {
                    menu[id] = arrayOfThisDay;
                    arrayOfThisDay = [];
                }
                id++;
            }
        });
        menu[id] = arrayOfThisDay;
    }); //end of parsing

    //console.log(menu);
    if (menu[0].length == 0)
        console.log("No daily dishes this wekk");

    var x = 0;

    menu.forEach(function (category) {
        var tmp = [];
        category.forEach(function (dish)
        {
            dish[1] = dish[1].substring(2, dish[1].length) + "€";
            tmp.push(dish.join(' '));
        });
        if (!(x == 0 && menu[0].length == 0)) //dont add anything if no daily dishes
            menuText[x] = tmp.join('\n');
        x++;
    }); //menutext successfully created

    dateOfRefresh = new Date().getWeekNumber();
}

/**
 * @param menuText
 * @param message
 */
function sendMenuText(menuText, message)
{
    var answer = {
        chat_id: message.chat.id,
        text: "",
        parse_mode: "HTML"
    };

    var command = message.text.substring(1, message.text.indexOf(" "));
    var id = -1;
    var out = [];

    if (command.length == 1)
    {
        id = new Date().getDay();
        if (id > 5 || id == 0)
            id = 1;

        out.push("<i>Heute gibt es:</i>");
    }
    else
        {
        var param = message.text.substring(message.text.indexOf(" ") + 1, message.text.length).toUpperCase();
        console.log("parameters " + param);

        if (param.startsWith("MO"))
        {
            out.push("<i>Der Speiseplan am Montag:</i>");
            id = 1;
        }
        else if (param.startsWith("DI"))
        {
            out.push("<i>Der Speiseplan am Dienstag:</i>");
            id = 2;
        }
        else if (param.startsWith("MI"))
        {
            out.push("<i>Der Speiseplan am Mittwoch:</i>");
            id = 3;
        }
        else if (param.startsWith("DO"))
        {
            out.push("<i>Der Speiseplan am Donnerstag:</i>");
            id = 4;
        }
        else if (param.startsWith("FR"))
        {
            out.push("<i>Der Speiseplan am Freitag:</i>");
            id = 5;
        }
        else if (param.startsWith("WOCHE"))
        {
            answer.text = "<i>Der Speiseplan der Woche:</i>\n" + menuText.join('\n\n');
        }
        else if (param == "RAN")
        {
            id = new Date().getDay();

            if (id > 5 || id == 0)
                id = 1;

            var dish = "";
            var todayDishes = menuText[id].split('\n');
            if (typeof menuText[0] === 'undefined')
            {
                var chosen = Math.floor((Math.random() * todayDishes.length));
                dish = todayDishes[chosen];
            }
            else
            {
                var dailyDishes = menuText[0].split('\n');
                var chosen = Math.floor((Math.random() * (dailyDishes.length + todayDishes.length)));
                dish = (chosen > dailyDishes.length) ? todayDishes[chosen - dailyDishes.length] : dailyDishes[chosen];
            }

            answer.text = "Du isst heute " + dish;
            id = -1;
        }
    }

    if (id != -1)
    {
        out.push(menuText[0]);
        out.push(menuText[id]);
        answer.text = out.join('\n');
    }


    //convert html characters
    answer.text = answer.text.decodeHTML();

    // send menu to chat
    unirest
        .post(SEND_MESSAGE_URL)
        .send(answer)
        .end(function (response) {
            if (response.status == 200)
                console.log("Successfully sent menu to " + message.chat.id);
            else
                console.log("Not able to send message..Err " + response.status);
        });
}

function HtmlEncode(s) {
    return $('<div>').text(s).html();
}

function HtmlDecode(s) {
    return $('<div>').html(s).text();
}

/**
 * @param message
 */
function sendHelp(message)
{
    var answer = {
        chat_id: message.chat.id,
        text: "<b>Mitteldorf Catering Speiseplan - Bot!</b>\nSende <b>\/[menu|futter|food]</b> für den heutigen Speiseplan\nSende <b>\/[menu|futter|food]</b> <i>tag</i> um den Speiseplan an einem bestimmten Wochentag abzurufen\nSende <b>\/menu</b> <i>woche</i> für den Speiseplan der gesamten Woche\nSende <b>\/refresh</b> um den Speiseplan bei einem Fehler zu aktualisieren",
        parse_mode: "HTML"
    };

    unirest
        .post(SEND_MESSAGE_URL)
        .send(answer)
        .end(function (response)
        {
            if (response.status == 200)
                console.log("Successfully sent help to " + message.chat.id);
            else
                console.log("Not able to send message..Err " + response.status);
        });
}

/**
 * @param message
 */
function sendBeerTime(message)
{
    var answerText = "";
    var date = new Date();
    if (date.getDay() == 0 || date.getDay() == 6)
    {
        answerText = "Na klar, es ist Wochenende, da ist immer die richtige Zeit ein Bier zu trinken!";
    }
    else if (date.getHours() > 15)
    {
        answerText = "Oh ja, es ist Zeit ein Bier zu trinken!";
    }
    else
    {
        answerText = "Nein, es ist leider noch nicht Zeit ein Bier zu trinken..";
    }
    var answer = {
        chat_id: message.chat.id,
        text: answerText,
        parse_mode: "HTML"
    };

    unirest
        .post(SEND_MESSAGE_URL)
        .send(answer)
        .end(function (response)
        {
            if (response.status == 200)
                console.log("Successfully sent help to " + message.chat.id);
            else
                console.log("Not able to send message..Err " + response.status);
        });
}

/**
 * @param message
 * @returns {boolean}
 */
function runCommand(message)
{
    var msgtext = message.text;

    if (msgtext != undefined)
    {
        if (msgtext.indexOf("/") != 0)
            return false; // no slash at beginning?

        var command = msgtext.substring(1, msgtext.indexOf(" "));
        if (command.length == 1)    //command only without parameters
            command = msgtext.substring(1, msgtext.length);

        console.log("Command: " + msgtext.substring(1, msgtext.length).toUpperCase());

        command = command.toUpperCase();

        if (command == "CAPSME")
        {
            capsMe(message);
            return true;
        }
        else if (command.startsWith("FUTTER") || command.startsWith("FOOD") || command.startsWith("MENU"))
        {
            sendMenu(message);
            return true;
        }
        else if (command == "HELP" || command == "?" || ((command.startsWith("HELP")) && command.indexOf("@MCL_BOT") != -1))
        {
            sendHelp(message);
        }
        else if (command == "BIER" || command == "BEER")
        {
            sendBeerTime(message);
        }
        else
        {
            console.log("omg omg omg, what shall i do?!");
        }
    }
    return false;
}

/**
 * @param message
 */
function refreshCache(message)
{
    var speisePlanURL = '';

    jsdom.env("http://www.mitteldorf-catering.de/", [], function (err, window) {
        speisePlanURL = window.document.getElementsByClassName("speiseplan")[0].href;

        if (speisePlanURL == undefined || speisePlanURL == '')
        {
            console.log("Cannot find URL to speiseplan... aborting :(");
            return false;
        }

        jsdom.env(speisePlanURL, [], function (err, window)
        {
            parseMenu(window);  //parsed into menuText
            //console.log(menuText);
            console.log("Cache refreshed.");
            if (typeof message !== 'undefined')
                sendMenuText(menuText, message);
        });
    });    //end of jsdom callback
}

/**
 * @returns {number}
 */
Date.prototype.getWeekNumber = function ()
{
    var d = new Date(+this);
    d.setHours(0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    return Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 8.64e7) + 1) / 7);
};

/**
 * @returns {string}
 */
String.prototype.decodeHTML = function() {
    var map = {"gt":">", "lt":"<", "nbsp":" ", "amp":"&", "quot":"'" /* , … */};
    return this.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);?/gi, function($0, $1) {
        if ($1[0] === "#") {
            return String.fromCharCode($1[1].toLowerCase() === "x" ? parseInt($1.substr(2), 16)  : parseInt($1.substr(1), 10));
        } else {
            return map.hasOwnProperty($1) ? map[$1] : $0;
        }
    });
};

/** Run */
console.log("MCL Bot started! Poll poll poll...");
poll();