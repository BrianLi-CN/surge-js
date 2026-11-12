
/**
 * 彩云天气 Surge Panel
 * 适用：Surge Mac 6.12.0
 * API：彩云天气 v2.6
 * 城市：南京
 */

// =========================
// 基础配置
// =========================

// 替换为你的彩云天气 API Token
const API_TOKEN = "ry5OWkwlJfqbualx";

// 南京市中心附近坐标（GCJ-02 近似值）
const CITY = "南京";
const LONGITUDE = 118.7969;
const LATITUDE = 32.0603;

// 使用 metric:v2 确保降水强度为 mm/h
const API_URL =
  `https://api.caiyunapp.com/v2.6/${API_TOKEN}/` +
  `${LONGITUDE},${LATITUDE}/realtime` +
  "?lang=zh_CN&unit=metric:v2";

// =========================
// 天气现象映射
// =========================

const WEATHER_MAP = {
  CLEAR_DAY: ["晴", "☀️"],
  CLEAR_NIGHT: ["晴", "🌙"],
  PARTLY_CLOUDY_DAY: ["多云", "⛅"],
  PARTLY_CLOUDY_NIGHT: ["多云", "☁️"],
  CLOUDY: ["阴", "☁️"],
  LIGHT_HAZE: ["轻度雾霾", "🌫️"],
  MODERATE_HAZE: ["中度雾霾", "🌫️"],
  HEAVY_HAZE: ["重度雾霾", "🌫️"],
  LIGHT_RAIN: ["小雨", "🌦️"],
  MODERATE_RAIN: ["中雨", "🌧️"],
  HEAVY_RAIN: ["大雨", "🌧️"],
  STORM_RAIN: ["暴雨", "⛈️"],
  FOG: ["雾", "🌫️"],
  LIGHT_SNOW: ["小雪", "🌨️"],
  MODERATE_SNOW: ["中雪", "❄️"],
  HEAVY_SNOW: ["大雪", "❄️"],
  STORM_SNOW: ["暴雪", "❄️"],
  DUST: ["浮尘", "🌫️"],
  SAND: ["沙尘", "🌪️"],
  WIND: ["大风", "💨"]
};

// =========================
// 工具函数
// =========================

function isNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value);
}

function formatNumber(value, digits = 1) {
  return isNumber(value)
    ? value.toFixed(digits)
    : "--";
}

function getWeather(code) {
  return WEATHER_MAP[code] || ["未知", "🌤️"];
}

function getAQILevel(aqi) {
  if (!isNumber(aqi)) return "未知";
  if (aqi <= 50) return "优";
  if (aqi <= 100) return "良";
  if (aqi <= 150) return "轻度污染";
  if (aqi <= 200) return "中度污染";
  if (aqi <= 300) return "重度污染";
  return "严重污染";
}

function getAQIStyle(aqi) {
  if (!isNumber(aqi)) return "info";
  if (aqi <= 100) return "info";
  if (aqi <= 150) return "warning";
  return "error";
}

function getWindDirection(degree) {
  if (!isNumber(degree)) return "未知";

  const directions = [
    "北风", "东北风", "东风", "东南风",
    "南风", "西南风", "西风", "西北风"
  ];

  const index =
    Math.floor(((degree % 360) + 360 + 22.5) % 360 / 45);

  return directions[index];
}

function finishError(message) {
  $done({
    title: `${CITY} · 天气获取失败`,
    content: message,
    style: "error"
  });
}

// =========================
// 校验 Token
// =========================

if (
  !API_TOKEN ||
  API_TOKEN === "YOUR_CAIYUN_API_TOKEN"
) {
  finishError(
    "尚未配置彩云天气 API Token。\n" +
    "请编辑 caiyun-weather.js 后刷新。"
  );
} else {
  fetchWeather();
}

// =========================
// 获取天气
// =========================

function fetchWeather() {
  $httpClient.get(
    {
      url: API_URL,
      headers: {
        Accept: "application/json"
      }
    },
    function (error, response, body) {

      if (error) {
        finishError(
          "网络请求失败\n" + String(error)
        );
        return;
      }

      const statusCode =
        response && (response.status || response.statusCode);

      if (statusCode && statusCode !== 200) {
        finishError(
          `彩云 API HTTP 错误：${statusCode}\n` +
          "请检查 Token、API 权限及网络。"
        );
        return;
      }

      let data;

      try {
        data = typeof body === "string"
          ? JSON.parse(body)
          : body;
      } catch (e) {
        finishError("API 返回的数据不是有效 JSON。");
        return;
      }

      if (!data || data.status !== "ok") {
        finishError(
          "彩云 API 返回失败：\n" +
          String((data && data.error) || "未知错误")
        );
        return;
      }

      const realtime =
        data.result && data.result.realtime;

      if (!realtime) {
        finishError("API 响应缺少 realtime 数据。");
        return;
      }

      renderWeather(realtime);
    }
  );
}

// =========================
// 渲染天气 Panel
// =========================

function renderWeather(rt) {

  const weather = getWeather(rt.skycon);

  const temperature = formatNumber(rt.temperature);
  const apparent = formatNumber(rt.apparent_temperature);

  const humidity = isNumber(rt.humidity)
    ? `${Math.round(rt.humidity * 100)}%`
    : "--";

  const precipitation =
    rt.precipitation &&
    rt.precipitation.local;

  const rainIntensity =
    precipitation &&
    isNumber(precipitation.intensity)
      ? `${formatNumber(precipitation.intensity)} mm/h`
      : "暂无数据";

  const wind = rt.wind || {};

  const windSpeed = isNumber(wind.speed)
    ? `${formatNumber(wind.speed)} km/h`
    : "--";

  const windDirection =
    getWindDirection(wind.direction);

  const air = rt.air_quality || {};

  const aqi = air.aqi && air.aqi.chn;

  const aqiText = isNumber(aqi)
    ? `${Math.round(aqi)} · ${getAQILevel(aqi)}`
    : "暂无数据";

  const pm25 = isNumber(air.pm25)
    ? `${Math.round(air.pm25)} μg/m³`
    : "--";

  const time = new Date().toLocaleTimeString(
    "zh-CN",
    {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  );

  const title =
    `${weather[1]} ${CITY} ${temperature}°C · ${weather[0]}`;

  const content = [
    `🌡 体感温度：${apparent}°C`,
    `💧 相对湿度：${humidity}`,
    `🌧 降水强度：${rainIntensity}`,
    `💨 风速：${windSpeed} · ${windDirection}`,
    `🍃 中国 AQI：${aqiText}`,
    `🌿 PM2.5：${pm25}`,
    `🕒 更新：${time}`
  ].join("\n");

  $done({
    title: title,
    content: content,
    style: getAQIStyle(aqi)
  });
}
