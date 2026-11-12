let args = getArgs();

(async () => {
  let info = JSON.parse(await getDataInfo(args.url));
  if (!info) $done();
  let resetDayLeft = getRmainingDays(parseInt(info.bw_reset_day_of_month));

  let used = info.bw_counter_b;
  let total = info.monthly_bw_limit_b;
  let overage = total - used;
  let expire = args.expire || info.expire;

  let content = [`用量：${bytesToSize(used)} | ${bytesToSize(total)}`,`剩余：${bytesToSize(overage)} | ${bytesToSize(total)}`];

  if (resetDayLeft) {
    content.push(`重置：剩余${resetDayLeft}天`);
  }
  if (expire && expire !== "false") {
    if (/^[\d.]+$/.test(expire)) expire *= 1000;
    content.push(`到期：${formatTime(expire)}`);
  }

  let now = new Date();
  let hour = now.getHours();
  let minutes = now.getMinutes();
  hour = hour > 9 ? hour : "0" + hour;
  minutes = minutes > 9 ? minutes : "0" + minutes;

  $done({
    title: `${args.title} | ${hour}:${minutes}`,
    content: content.join("\n"),
    icon: args.icon || "airplane.circle",
    "icon-color": args.color || "#007aff",
  });
})();

function getArgs() {
  return Object.fromEntries(
	$argument
      .split("&")
      .map((item) => item.split("="))
      .map(([k, v]) => [k, decodeURIComponent(v)])
  );
}

function getUserInfo(url) {
  return new Promise((resolve, reject) =>
    $httpClient.get(url, function(error, response, data) {
	    if (error) {
	    	reject(err);
        	return;
	    } else {
	    	resolve(data);
        	return;
	    }
	    reject("链接响应头不带有流量信息");
	  })
  );
}

async function getDataInfo(url) {
  const [err, data] = await getUserInfo(url)
    .then((data) => [null, data])
    .catch((err) => [err, null]);
  if (err) {
    console.log(err);
    return;
  }
  return data;
}

function getRmainingDays(resetDay) {
  if (!resetDay) return;

  let now = new Date();
  let today = now.getDate();
  let month = now.getMonth();
  let year = now.getFullYear();
  let daysInMonth;

  if (resetDay > today) {
    daysInMonth = 0;
  } else {
    daysInMonth = new Date(year, month + 1, 0).getDate();
  }

  return daysInMonth - today + resetDay;
}

function bytesToSize(bytes) {
  if (bytes === 0) return "0B";
  let k = 1000;
  sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

function formatTime(time) {
  let dateObj = new Date(time);
  let year = dateObj.getFullYear();
  let month = dateObj.getMonth() + 1;
  let day = dateObj.getDate();
  return year + "年" + month + "月" + day + "日";
}