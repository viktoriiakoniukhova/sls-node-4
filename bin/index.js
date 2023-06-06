#!usr/bin/env mode
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const INT_3 = 3;
const INT_6 = 6;

let intervalId, prevIntValue;
let forecast = "";
//BOT setup

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, () => {
  fetchForecast();
});

bot.onText(/\/(start|getwf)/, (msg) => {
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Forecast in Dnipro", callback_data: "button1" }],
      ],
    },
  };

  bot.sendMessage(chatId, "Press the button below:", options);
});

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const buttonData = query.data;

  if (buttonData === "button1") {
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "At intervals of 3 hours", callback_data: "button2" },
          { text: "At intervals of 6 hours", callback_data: "button3" },
        ],
      ],
    };

    const options = {
      chat_id: chatId,
      message_id: messageId,
    };

    bot.editMessageReplyMarkup(replyMarkup, options);
  } else if (buttonData === "button2") {
    startInterval(INT_3, chatId);
    bot.sendMessage(chatId, forecast);
  } else if (buttonData === "button3") {
    startInterval(INT_6, chatId);
    bot.sendMessage(chatId, forecast);
  }

  bot.answerCallbackQuery(query.id);
});

//OpenWeather
const coords = { lat: 48.469010256785616, lng: 35.03330292211286 };
const url = `https://api.openweathermap.org/data/2.5/forecast?units=metric&lat=${coords.lat}&lon=${coords.lng}&appid=${process.env.OW_API_KEY}&lang=uk`;

function startInterval(intValue) {
  const isIntervalChanged =
    intervalId && prevIntValue && intValue !== prevIntValue;

  if (!intervalId || isIntervalChanged) {
    if (isIntervalChanged) {
      clearInterval(intervalId);
    }
    intervalId = setInterval(fetchForecast, intValue * 60 * 60 * 1000);
  }

  prevIntValue = intValue;
}

function fetchForecast() {
  forecast = "";

  axios
    .get(url)
    .then(({ data }) => {
      const { list } = data;

      // Group objects by date
      const grouped = new Map();

      for (const obj of list) {
        //Form data
        const { dt_txt, main, weather } = obj;
        const { temp, feels_like } = main;

        const date = formateDate(dt_txt);
        const time = getTime(dt_txt);
        const { description } = weather[0];

        const hourForecast = `${time}: температура ${formateTemp(
          temp
        )}, відчувається як ${formateTemp(feels_like)}, ${description}`;

        if (grouped.has(date)) grouped.get(date).push(hourForecast);
        else grouped.set(date, [hourForecast]);
      }

      //Form output for user
      grouped.forEach((value, key) => {
        forecast += `${key}\n`;
        value.forEach((value) => {
          forecast += `\t\t${value}\n`;
        });
      });
    })
    .catch((err) => {
      throw new err();
    });
}
function formateDate(str) {
  const date = new Date(str);

  const options = {
    weekday: "long",
    day: "numeric",
    month: "long",
  };

  return date.toLocaleDateString("uk-UA", options);
}
function getTime(str) {
  const date = new Date(str);

  const options = {
    hour: "numeric",
    minute: "numeric",
  };

  return date.toLocaleTimeString("uk-UA", options);
}
function formateTemp(temp) {
  const isNegative = temp < 0;
  return `${!isNegative && "+"}${Math.floor(temp)}°C`;
}
