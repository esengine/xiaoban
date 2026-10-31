export const catalogs = {
  "zh-CN":
    "app-name = 小伴\nhub-default-name = 小伴\n\nprompt-system = 你是小伴，一个像朋友一样陪用户处理日常生活的助手。回答简洁、具体，用中文。\n\nnav-main = 主导航\ndevice-desktop = 这台电脑\ndevice-ios = iPhone\ndevice-android = 安卓手机\n\nconnection-idle = 未连接\nconnection-connecting = 连接中\nconnection-open = 已连接\nconnection-reconnecting = 重新连接中\nconnection-closed = 已断开\nconnection-waiting-for-hub = 正在连接家里的电脑…\n\nthread-new = 新对话\nthread-untitled = 新的对话\nthread-empty = 还没有对话\nthread-start = 和小伴聊聊\n\ncomposer-label = 对小伴说\ncomposer-placeholder = 说点什么\ncomposer-send = 发送\ncomposer-stop = 停\n\ndraft-thinking = 在想…\ndraft-elapsed = 已想 { $seconds } 秒\ndraft-failed = 没成功：{ $reason }\n\nfailure-model = 模型出了点问题\nfailure-not-configured = 还没有连接模型\nfailure-network = 网络断了\nfailure-cancelled = 已停止\nfailure-budget = 到了花费上限\nfailure-internal = 小伴内部出错了\n\nerror-unsupported-protocol = 电脑上的小伴版本不匹配，请都更新到最新版\nerror-unauthorized = 配对码不对或已过期\nerror-bad-request = 请求有误\nerror-not-found = 找不到这条内容\nerror-busy = 上一条还在回复，稍等一下\nerror-internal = 小伴内部出错了\nerror-unreachable = 连不上电脑，确认手机和电脑在同一个 Wi-Fi 下\n\npair-title = 连接家里的电脑\npair-lead = 在电脑上打开小伴 › 设置 › 设备，把显示的地址和配对码填在这里。\npair-address-placeholder = 电脑地址，比如 192.168.1.8\npair-code-placeholder = 6 位配对码\npair-submit = 连接\npair-submitting = 连接中…\n",
  en: "app-name = Xiaoban\nhub-default-name = Xiaoban\n\nprompt-system = You are Xiaoban, a friendly companion who helps the user with everyday life. Keep answers short and concrete, and reply in English.\n\nnav-main = Main navigation\ndevice-desktop = This computer\ndevice-ios = iPhone\ndevice-android = Android phone\n\nconnection-idle = Not connected\nconnection-connecting = Connecting\nconnection-open = Connected\nconnection-reconnecting = Reconnecting\nconnection-closed = Disconnected\nconnection-waiting-for-hub = Connecting to your home computer…\n\nthread-new = New conversation\nthread-untitled = New conversation\nthread-empty = No conversations yet\nthread-start = Start chatting\n\ncomposer-label = Message Xiaoban\ncomposer-placeholder = Say something\ncomposer-send = Send\ncomposer-stop = Stop\n\ndraft-thinking = Thinking…\ndraft-elapsed = Thought for { $seconds } s\ndraft-failed = Didn’t work: { $reason }\n\nfailure-model = The model ran into a problem\nfailure-not-configured = No model is connected yet\nfailure-network = The network dropped\nfailure-cancelled = Stopped\nfailure-budget = Spending limit reached\nfailure-internal = Something went wrong inside Xiaoban\n\nerror-unsupported-protocol = Xiaoban versions don’t match. Update both devices.\nerror-unauthorized = The pairing code is wrong or has expired\nerror-bad-request = Invalid request\nerror-not-found = Not found\nerror-busy = Still replying to the previous message\nerror-internal = Something went wrong inside Xiaoban\nerror-unreachable = Can’t reach your computer. Check that both are on the same Wi-Fi.\n\npair-title = Connect your home computer\npair-lead = On your computer, open Xiaoban › Settings › Devices and enter the address and pairing code shown there.\npair-address-placeholder = Computer address, e.g. 192.168.1.8\npair-code-placeholder = 6-digit pairing code\npair-submit = Connect\npair-submitting = Connecting…\n",
} as const;

export type MessageKey =
  | "app-name"
  | "composer-label"
  | "composer-placeholder"
  | "composer-send"
  | "composer-stop"
  | "connection-closed"
  | "connection-connecting"
  | "connection-idle"
  | "connection-open"
  | "connection-reconnecting"
  | "connection-waiting-for-hub"
  | "device-android"
  | "device-desktop"
  | "device-ios"
  | "draft-elapsed"
  | "draft-failed"
  | "draft-thinking"
  | "error-bad-request"
  | "error-busy"
  | "error-internal"
  | "error-not-found"
  | "error-unauthorized"
  | "error-unreachable"
  | "error-unsupported-protocol"
  | "failure-budget"
  | "failure-cancelled"
  | "failure-internal"
  | "failure-model"
  | "failure-network"
  | "failure-not-configured"
  | "hub-default-name"
  | "nav-main"
  | "pair-address-placeholder"
  | "pair-code-placeholder"
  | "pair-lead"
  | "pair-submit"
  | "pair-submitting"
  | "pair-title"
  | "prompt-system"
  | "thread-empty"
  | "thread-new"
  | "thread-start"
  | "thread-untitled";

export interface MessageArgs {
  "app-name": undefined;
  "composer-label": undefined;
  "composer-placeholder": undefined;
  "composer-send": undefined;
  "composer-stop": undefined;
  "connection-closed": undefined;
  "connection-connecting": undefined;
  "connection-idle": undefined;
  "connection-open": undefined;
  "connection-reconnecting": undefined;
  "connection-waiting-for-hub": undefined;
  "device-android": undefined;
  "device-desktop": undefined;
  "device-ios": undefined;
  "draft-elapsed": { seconds: string | number };
  "draft-failed": { reason: string | number };
  "draft-thinking": undefined;
  "error-bad-request": undefined;
  "error-busy": undefined;
  "error-internal": undefined;
  "error-not-found": undefined;
  "error-unauthorized": undefined;
  "error-unreachable": undefined;
  "error-unsupported-protocol": undefined;
  "failure-budget": undefined;
  "failure-cancelled": undefined;
  "failure-internal": undefined;
  "failure-model": undefined;
  "failure-network": undefined;
  "failure-not-configured": undefined;
  "hub-default-name": undefined;
  "nav-main": undefined;
  "pair-address-placeholder": undefined;
  "pair-code-placeholder": undefined;
  "pair-lead": undefined;
  "pair-submit": undefined;
  "pair-submitting": undefined;
  "pair-title": undefined;
  "prompt-system": undefined;
  "thread-empty": undefined;
  "thread-new": undefined;
  "thread-start": undefined;
  "thread-untitled": undefined;
}
