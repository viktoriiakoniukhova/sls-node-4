const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

//Vars setup
const INTERVAL_3 = 3;
const INTERVAL_6 = 6;

let intervalId,
  prevMessage = "";

//OpenWeather setup
const api = process.env.OW_API_KEY;
const coords = { lat: 48.469010256785616, lng: 35.03330292211286 };
const url = `https://api.openweathermap.org/data/2.5/forecast?units=metric&lat=${coords.lat}&lon=${coords.lng}&appid=${api}&lang=uk`;
const weather_url = `https://api.openweathermap.org/data/2.5/weather?units=metric&lat=${coords.lat}&lon=${coords.lng}&appid=${api}&lang=uk`;

//BOT setup

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

//keyboards
const keyboardMenu = {
  reply_markup: {
    keyboard: [["Погода в Дніпрі"], ["Оформити підписку"]],
    resize_keyboard: true,
  },
};

const keyboardSubmenuForecast = {
  reply_markup: {
    keyboard: [["Кожні 3 години", "Кожні 6 годин"], ["Назад"]],
    resize_keyboard: true,
  },
};

const keyboardMenuSubsribe = {
  reply_markup: {
    keyboard: [["Погода в Дніпрі"], ["Налаштувати підписку"]],
    resize_keyboard: true,
  },
};

const keyboardSubmenuSubscribe = {
  reply_markup: {
    keyboard: [["Відписатись"], ["Назад"]],
    resize_keyboard: true,
  },
};

// Bot event handlers
bot.on("polling_error", (error) => {
  console.log("Помилка: ", error.message);
});

bot.onText(/(\/start)|Назад/, (msg) => {
  const chatId = msg.chat.id;

  const hasSubsription = getUser(chatId) !== undefined;

  if (!hasSubsription) {
    bot.sendMessage(chatId, "Оберіть потрібну функцію:", keyboardMenu);
  } else
    bot.sendMessage(chatId, "Оберіть потрібну функцію:", keyboardMenuSubsribe);
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const response = msg.text;

  if (prevMessage && prevMessage.includes("підписку") && !isNaN(+response)) {
    startInterval(+response, chatId);
  }

  prevMessage = response;

  switch (response) {
    case "Погода в Дніпрі":
      bot.sendMessage(chatId, "Оберіть інтервал: ", keyboardSubmenuForecast);
      break;
    case "Кожні 3 години":
      fetchForecast(chatId, INTERVAL_3);
      break;
    case "Кожні 6 годин":
      fetchForecast(chatId, INTERVAL_6);
      break;
    case "Оформити підписку":
      bot.sendMessage(
        chatId,
        "Надішліть у наступному повідомлені бажаний інтервал у годинах:\nНаприклад: 5"
      );
      break;
    case "Налаштувати підписку":
      bot.sendMessage(
        chatId,
        `Ваша поточна підписка: ${getUser(
          chatId
        )} годин(и).\n\nНадішліть у наступному повідомлені бажаний інтервал у годинах:\nНаприклад: 5\n\nЩоб відмовитись від поточної підписки натисніть "Відписатись"`,
        keyboardSubmenuSubscribe
      );
      break;
    case "Відписатись":
      stopInterval(chatId);
      break;
    default:
      break;
  }
});

//Functions for managing intervals
function startInterval(intervalValue, chatId) {
  const prevIntervalValue = getUser(chatId);

  const isIntervalChanged =
    intervalId && prevIntervalValue && intervalValue !== prevIntervalValue;
  if (!intervalId || isIntervalChanged) {
    if (isIntervalChanged) {
      clearInterval(intervalId);
    }
    intervalId = setInterval(() => {
      fetchWeather(chatId);
    }, intervalValue * 60 * 60 * 1000);

    addUser(chatId, intervalValue);

    bot.sendMessage(
      chatId,
      `Тепер ви будете отримувати сповіщення про погоду раз на ${intervalValue} годин`,
      keyboardMenuSubsribe
    );
  }
}

function stopInterval(chatId) {
  clearInterval(intervalId);
  intervalId = undefined;
  removeUser(chatId);
  bot.sendMessage(
    chatId,
    `Ви успішно відписалися від сповіщень про погоду.`,
    keyboardMenu
  );
}

//Functions for managing chatIds and intervals
function addUser(chatId, intervalValue) {
  fs.readFile("data.json", "utf-8", (err, data) => {
    if (err) throw err;

    const nData = JSON.parse(data);
    const { usersdata } = nData;
    usersdata[chatId] = intervalValue;

    fs.writeFile("data.json", JSON.stringify(nData), (err) => {
      if (err) throw err;
    });
  });
}

function getUser(chatId) {
  const data = fs.readFileSync("data.json", "utf-8");
  const nData = JSON.parse(data);
  const { usersdata } = nData;

  return usersdata[chatId];
}

function removeUser(chatId) {
  fs.readFile("data.json", "utf-8", (err, data) => {
    if (err) throw err;

    const nData = JSON.parse(data);
    let { usersdata } = nData;

    delete usersdata[chatId];

    fs.writeFile("data.json", JSON.stringify(nData), (err) => {
      if (err) throw err;
    });
  });
}

function fetchForecast(chatId, intValue) {
  let forecast = "Погода в Дніпрі:\n";
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
        const time = getTime(dt_txt, intValue);
        const { description } = weather[0];

        if (time) {
          const hourForecast = `${time}: темп.: ${formateTemp(
            temp
          )} (відчув. як: ${formateTemp(feels_like)}), ${description}`;

          if (grouped.has(date)) grouped.get(date).push(hourForecast);
          else grouped.set(date, [hourForecast]);
        }
      }

      //Form output for user
      grouped.forEach((value, key) => {
        forecast += `\n--- ${key} ---\n\n`;
        value.forEach((value) => {
          forecast += `${value}\n`;
        });
      });

      bot.sendMessage(chatId, forecast);
    })
    .catch((err) => {
      console.log(err);
    });
}

function fetchWeather(chatId) {
  let weatherForecast = "Погода в Дніпрі:\n";
  axios
    .get(weather_url)
    .then(({ data }) => {
      //Form data
      const { dt, main, weather } = data;
      const { temp, feels_like } = main;
      const { description } = weather[0];

      const time = getTimeUnix(dt);
      const hourForecast = `${time}: темп.: ${formateTemp(
        temp
      )} (відчув. як: ${formateTemp(feels_like)}), ${description}`;

      //Form outut for user
      weatherForecast += `\n${hourForecast}`;
      bot.sendMessage(chatId, weatherForecast);
    })
    .catch((err) => {
      console.log(err);
    });
}

// Functions for formating data from OpenWeather
function formateDate(str) {
  const date = new Date(str);

  const options = {
    weekday: "long",
    day: "numeric",
    month: "long",
  };

  return date.toLocaleDateString("uk-UA", options);
}
function getTime(str, intValue) {
  const date = new Date(str);

  const options = {
    hour: "numeric",
    minute: "numeric",
  };
  if (date.getHours() % intValue === 0)
    return date.toLocaleTimeString("uk-UA", options);
}
function formateTemp(temp) {
  const isNegative = temp <= 0;
  return `${!isNegative && "+"}${Math.floor(temp)}°C`;
}

function getTimeUnix(unixTs) {
  const date = new Date(unixTs * 1000);

  const options = {
    hour: "numeric",
    minute: "numeric",
  };

  return date.toLocaleTimeString("uk-UA", options);
}
