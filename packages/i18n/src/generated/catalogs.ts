export const catalogs = {
  "zh-CN":
    'app-name = 小伴\nhub-default-name = 小伴\n\nprompt-system = 你是小伴，一个像朋友一样陪用户处理日常生活的助手。回答简洁、具体，用中文。\nprompt-memory-heading = 关于用户，你已经记住的事（用户随时可能修改）：\nmemory-recall-label = 可能相关的记忆\nprompt-memory-galaxies = 其余记忆按下面的星系存着，需要时用 recall 打开某个星系或按关键词查；和你这句话最相关的几条会附在消息里：\nprompt-memory-policy = 用户透露值得长期记住的事（怎么称呼、家里有谁、住在哪、在哪上班、长期的偏好、过敏和禁忌、重要的日子、有日期的安排），调用 remember 记下来，再自然地回应。记的时候把它放进对应的星系（一个人或一件事，已有的用同一个名字；用户本人的称呼、住处、工作、生日等放进「我」），写清类型、重要程度，并写上以后可能用来提到它的说法和场景词；过敏、禁忌这类不能忘的设为 constraint，几乎每次都用得到的设为常驻；有日期的写上到期日；取代旧信息时写 replaces。闲聊和你不确定的推测不要记。消息里附的「可能相关的记忆」不够时，用 recall 打开星系或按关键词查。 用户说某条记错了：有正确内容就用同一个 subject 直接改成正确的；没有就用 forget 删掉。不要写「之前记错了」「已作废」这类说明进记忆。\nquote-context-label = 用户引用了这段\nturn-regenerate = 换个思路，把上一个问题重新回答一遍。\nprompt-memory-tidy = 你在帮用户整理记忆。输入是一个 JSON。如果有 galaxy 字段，就整理这个星系里的记忆：找出说的是同一件事的重复记忆（merge：keep 保留哪条 id，drop 合并掉哪些 id），找出被新信息取代的旧记忆（replace：old 旧 id，new 新 id），给别名不全或过时的记忆重写别名（alias_updates：id 对应新的别名列表），某条明显属于别的星系就移走（moves：id、galaxy 星系名、cluster），最后为这个星系写一句不超过 40 字的概要（summary）和这个星系的别称（aliases）。如果 task 是 place，就为每条记忆选一个星系（moves），优先用已有的星系名；用户本人的基本信息（称呼、住处、工作、生日）放进「我」；不要给单独一条记忆单开一个星系，没有合适的才起一个能装下同类记忆的简短新名字，cluster 从给出的列表里选。只做有把握的改动，拿不准就不动。只能用输入里出现过的 id。只输出一个 JSON 对象，字段是 summary、aliases、merge、replace、alias_updates、moves，没有的就给空值。 字段格式：summary 是字符串；aliases 是字符串列表；merge 是列表，每项有 keep（字符串）和 drop（字符串列表）；replace 是列表，每项有 old 和 new；alias_updates 是列表，每项有 id 和 aliases（字符串列表）；moves 是列表，每项有 id、galaxy、cluster。没有的就给空列表或空字符串。 如果 task 是 review，输入是全部星系（名字、所属星系团、条数、概要）：把说的是同一个人或同一件事的星系合并，把只有一两条、明显该归到别处的小星系并进合适的星系（用户本人的基本信息并进「我」），名字不清楚的改个清楚的名字，星系团放错的改正。输出 JSON 对象，字段 galaxies 是列表，每项有 name（现在的名字）、into（合并到或改成的名字）、cluster；只列要改的，不改的不要列。\nprompt-archive = 你在为一段很长的对话写累积要点，供你之后接着聊时参考。会给你之前的要点（可能为空）和接下来一段对话原文（user 是用户，assistant 是你，tool 是工具结果）。把新内容合并进要点：在做哪些事、做了哪些决定和约定、关键信息（时间、地点、数字、名字）、还没办完的事和下一步；已经办完或被推翻的删掉。不超过 1500 字，只写事实，不编造，直接输出新的要点。\nprompt-thinking-pick = 判断下面这条用户消息需要你想多深再回答，只输出一个词：none（闲聊、寒暄、一句话就能答的）、low（简单任务）、high（日常任务，需要认真想清楚）、max（高度复杂的任务：难题、长推理、复杂规划或编程）。拿不准就输出 high。\narchive-previous-label = 之前的要点：\narchive-chunk-label = 接下来的对话：\narchive-summary-label = 这个对话较早的部分已归档，以下是累积要点（需要细节时用 history_search 翻聊天记录）：\narchive-recall-label = 归档的聊天记录里可能相关的片段\nprompt-thread-title = 给下面这段对话起一个简短的中文标题，不超过 12 个字，说清在聊什么事，不要标点和引号，只输出标题。\nprompt-interpret-answer = 你在帮用户完成首次设置。界面问了用户一个问题，下面会给出问题、要记住的主题、你上一次说的话（followUp，可能是追问或根据定位做的猜测）、能否定位（canLocate）和用户的回答。判断属于哪种情况：一、回答了问题，或者确认了你的猜测，就把要记住的内容整理成简洁干净的说法（比如“叫我阿哲就行”整理成“阿哲”），只保留用户说过或确认过的信息，不要编造；二、用户不想回答、想跳过、说先不说或以后再说，或者同意了你提出的跳过，就当作跳过，不要再劝；三、canLocate 为 true，并且用户让你猜、让你自己查或者让你定位，就请求定位；四、答非所问、看不懂、像随手乱打或明显在开玩笑，就写一句简短亲切的话请用户换个说法再答。只输出一个 JSON 对象，包含四个字段：value（情况一时要记住的内容，否则为 null）、skip（情况二时为 true，否则为 false）、locate（情况三时为 true，否则为 false）、reply（情况四时对用户说的话，否则为 null）。\ntool-remember-description = 记住一条关于用户、值得长期保留的事实。同一主题再次调用会覆盖旧内容。\ntool-remember-subject = 简短的主题名，比如“称呼”“孩子”“过敏”\ntool-remember-value = 要记住的内容，用一句话写清楚\ntool-remember-category = 分类：family 家人、food 饮食、home_work 住处和工作、likes 喜好、plans 计划、other 其他\ntool-forget-description = 删除一条记忆。只在用户说要忘掉、或者说某条记错了而且没有正确内容可改时用\ntool-forget-subject = 要删除的记忆的 subject\ntool-remember-galaxy = 这条记忆属于哪个人或哪件事（星系），比如“儿子”“装修”“杭州行程”“工作”。已有的就用同一个名字\ntool-remember-kind = 类型：fact 事实；preference 偏好；constraint 约束（过敏、禁忌、不能做的事，碰到相关的事必须想起）；plan 计划（有时间的安排）\ntool-remember-importance = 重要程度：3 涉及健康、安全、钱或家人的；2 一般；1 顺带一提的小事\ntool-remember-aliases = 以后可能用来提到这件事的说法和场景词，包括家里人的叫法、同义词、会问到它的场景（比如过敏写上：孩子、娃、坚果、点餐、外卖、做饭）。写你真觉得有用的，多少由你判断，不要凑数\ntool-remember-pinned = 是否常驻：几乎每次聊天都可能用到的（称呼、家人、过敏禁忌）设为 true\ntool-remember-expires = 有到期的写到期日 YYYY-MM-DD（比如“下周三加班”），过期后不再主动提起\ntool-remember-replaces = 如果这条取代了某条旧记忆（比如搬家后的新地址），写旧记忆的 subject\nprompt-tool-policy = 涉及天气、地点、出行、门票这类需要实时信息的问题，先调用工具查清楚再回答，不要凭印象编数字。查不到就直说查不到。排行程时先查天气，需要门票、开放时间时联网查，排好后调用 save_trip 保存。\nnow-context-label = 现在\ntool-weather-description = 查一个地方的实时天气和未来几天的预报（最高最低气温、天气、降雨概率）。\ntool-weather-place = 地名，城市、区县或景点，比如“杭州”“西湖区”\ntool-weather-days = 要查未来几天，1 到 16，默认 7\nservice-resume-search = 联网搜索已经接上了，接着把刚才的事查清楚。\nservice-declined-search = 这次先不联网搜索。按你知道的接着做，并说明门票、开放时间这些信息没联网核实。\ntool-web-search-description = 联网搜索最新信息，比如门票、开放时间、活动、攻略。返回网页标题、链接和摘要。需要细节时再用 read_page 读原网页。\ntool-web-search-query = 搜索词，写具体一些\ntool-read-page-description = 读取一个网页的正文（Markdown）。用来核对门票、开放时间这类细节，优先读官网。\ntool-read-page-url = 网页链接，必须是 http 或 https\ntool-locate-description = 查用户此刻所在的城市和区。只在用户说“附近”“这里”“从这儿出发”这类需要当前位置的话时调用；平时用记住的住处。\ntool-find-apps-description = 在这台电脑上按名称查已安装的软件，返回软件名和 id。用户想用某个软件、或问装没装某个软件时调用。按软件名或英文名查，可以一次给几个可能的名字，用空格隔开，比如“微信 WeChat”“Photoshop 美图 Pixelmator”。\ntool-find-apps-query = 软件名关键词，几个可能的名字用空格隔开\ntool-open-app-description = 在这台电脑上打开一个软件。id 必须来自 find_apps 的结果。\ntool-open-app-id = find_apps 返回的软件 id\ntool-open-app-name = 软件名称，用来给用户显示\ntool-look-at-app-description = 看一个软件当前窗口里有哪些按钮、输入框、菜单，返回带编号的列表。开始操作前先看一次；之后 click、type_text、press_keys、do_steps 都会自动带回新画面（screen 字段），不用再单独看。app 必须是 find_apps 返回的 id。\ntool-operate-app = 软件 id，来自 find_apps\ntool-operate-app-name = 软件名称，用来给用户显示\ntool-operate-element = look_at_app 列表里的编号\ntool-operate-label = 这个元素的名字，用来给用户显示，比如“导出 PDF”\ntool-click-description = 点一下 look_at_app 列表里某个编号的按钮、菜单或选项。做完会带回新画面。\ntool-type-text-description = 把文字填进某个编号的输入框，会替换原有内容。不要填密码、验证码、银行卡号。做完会带回新画面。\ntool-type-text-text = 要填的文字\ntool-press-keys-description = 在软件里按快捷键或按键，比如 cmd+s、cmd+shift+e、return、tab、esc。做完会带回新画面。\ntool-press-keys-keys = 按键组合，用 + 连接\ntool-recall-description = 回忆：打开某个星系看里面全部记忆，或者按关键词在所有记忆里找。消息里附的「可能相关的记忆」不够、或者要确认细节时用\ntool-recall-galaxy = 要打开的星系名，来自记忆目录\ntool-recall-query = 要找的内容\ntool-history-search-description = 辅助：按关键词在归档里粗筛（会漏掉换了说法的）；优先用 history_outline 看目录自己判断\ntool-history-query = 要找的内容，用当时可能说过的词\ntool-history-read-description = 读归档聊天记录里某个位置前后的原文\ntool-history-at = 位置，来自 history_search 的 at\ntool-list-threads-description = 看会话列表：按最近更新列出用户的其他会话（id、标题、日期、条数、开头那句话），每页 30 个。要找以前聊过的事时先用它，看标题和开头自己判断哪个相关，再用 read_thread 读\ntool-page = 第几页，从 0 开始\ntool-read-thread-page = 第几页：0 是最新的一页，越大越早\ntool-history-outline-description = 看归档目录：这个对话已归档部分的目录，每 20 条一段，写开头那句话和时间。需要早先细节时先看目录自己判断，再用 history_read 读那一段\ntool-find-threads-description = 辅助：按关键词在其他会话里粗筛（会漏掉换了说法的），会话很多时用来缩小范围；优先用 list_threads 自己看\ntool-find-threads-query = 要找的内容\ntool-read-thread-description = 读另一个会话的原文：第 0 页是最新的一段并附上它的要点，往后翻页越来越早\ntool-read-thread-id = 会话 id，来自 find_threads\nthread-reference-label = 用户引用了会话「{ $title }」，以下是它的要点和最近几轮\ntool-open-subthreads-description = 开子会话：把一件大事拆成几件可以各自独立完成、需要较长时间的事，每件开一个长期保留的子会话去做，做完自动汇报回这里。会先问用户。简单的事不要开；子会话里不能再开子会话\ntool-open-subthreads-reason = 一句话告诉用户为什么要开、开完会怎样\ntool-subthread-title = 子会话标题，简短\ntool-subthread-task = 交给这个子会话的完整任务说明，写清要做什么、做到什么程度、汇报什么\ntool-message-subthread-description = 给自己的一个子会话发话：它正在做时排进去，空闲时让它开始做\ntool-message-subthread-text = 要说的话\nsubthread-task-label = 这是主会话「{ $title }」派给你的任务\nsubthread-task-rules = 认真做完；最后一条回复写清结论和关键数据，它会原样汇报回主会话。你不能再开子会话。\nsubthread-report-label = 子会话「{ $title }」的汇报\nsubthread-report-rules = 这是你派出去的子会话做完后的结果。结合其他子会话的情况接着处理：都齐了就汇总回复用户；还有没做完的就简短说明进度，等其他汇报。\ntool-spawn-agents-description = 派子代理：把一件大事里互不相干、能同时做的几部分交给几个一次性的子代理并行去做（它们能用你的工具），全部做完后结果一起交回给你。只在任务确实大、而且拆开能明显更快时用；简单的事、一两步能做完的事、前后有依赖的事都自己做，不要派。派的数量尽量少\ntool-agent-title = 这个子代理做什么，简短，给用户看\ntool-agent-task = 交给这个子代理的完整说明，写清要查或要做什么、交回什么\nagent-task-label = 你是一个子代理，只负责这一件事：{ $title }。做完用简洁的文字交回结果和关键数据。\ntool-file-search-description = 在用户发来的大文件里按关键词找相关段落，返回页码和片段。大文件只给了目录和开头，问到具体内容时先用它找，再用 file_read 读那几页。\ntool-file-read-description = 读用户发来的文件的第 from 到 to 页（表格和文本按段算页）。一次最多约 8000 字，没读完会告诉你读到哪页。\ntool-file-id = 文件 id，来自消息里的附件说明\ntool-file-query = 要找的内容，用文件里可能出现的词\ntool-file-from = 从第几页开始\ntool-file-to = 读到第几页\nfile-note-full = 附件 { $name }（{ $pages } 页，全文）\nfile-note-on-demand = 附件 { $name }（{ $pages } 页，太长只给目录和开头；需要细节时用 file_search / file_read，file = { $id }）\nfile-note-image = 附件图片 { $name }\nfile-note-unreadable = 附件 { $name }（这种文件读不出文字）\nfile-note-outline = 目录\nfile-note-preview = 开头\ntool-do-steps-description = 一次连着做好几步，比逐个点快得多，能连着做就优先用它。每步是 click（点编号）、type（往编号输入框填字）、keys（按快捷键）、text（直接往软件里打一串字，比如计算器里打 12+34=）。只把同一个画面上的步骤放在一起；某步会打开新窗口或菜单时，就在那步结束，看了新画面再继续。哪一步失败会停下并告诉你，最后带回新画面。\ntool-do-steps-summary = 这组步骤在做什么，给用户看，比如“输入 12+34=”\ntool-do-steps-steps = 按顺序要做的步骤\ntool-confirm-description = 替用户做有后果的事之前先调用它请用户点头：给别人发消息、提交表单、删除、付款、覆盖文件。返回 yes、edit 或 no，按回答行事。\ntool-confirm-title = 一句话问题，比如“要发给「老婆」吗？”\ntool-confirm-detail = 要发出或要改的具体内容，一两行\ntool-save-trip-description = 把排好的行程保存下来。界面会把它显示成一张行程卡片，可以打开看详情、跳到高德导航。会自动补上每天的天气，能算路程时会用真实路程替换你的估计。排好或改好行程时调用；回答里只写简短说明，不要再把行程列一遍。\ntool-save-trip-title = 标题，比如“杭州 · 3 天”\ntool-save-trip-city = 目的地城市，比如“杭州”\ntool-save-trip-party = 谁去，比如“2 大 1 小（6 岁）”\ntool-save-trip-needs = 需要照顾的事，比如“不吃花生”，没有就不填\ntool-save-trip-reminder = 给用户的一句提醒，比如天气变化或要提前到的地方\ntool-save-trip-cost = 估算花费，比如“约 ¥4,800 · 高铁、酒店、门票”，按公开价估\ntool-save-trip-update = 是在改这个对话里已有的行程时填 true\ntool-save-trip-day-date = 日期，格式 2026-11-14\ntool-save-trip-day-change = 这天因为天气等原因做了什么调整，一句话；没有就不填\ntool-save-trip-stop-name = 地点名称，要能在高德上搜到，比如“中国茶叶博物馆”\ntool-save-trip-stop-time = 到达时间，比如“09:00”\ntool-save-trip-stop-note = 一句备注，比如“早上人少，推车好走”\ntool-save-trip-stop-detail = 地点详情。景点、餐厅、商场都必须填，内容来自你联网查到的资料；车站、机场、酒店这类交通和住宿点不填\ntool-save-trip-next-mode = 去下一站怎么走：walk 步行、taxi 打车、transit 公交地铁\ntool-save-trip-next-minutes = 去下一站大约要几分钟，按你的经验估\ntool-save-trip-detail-why = 为什么值得去，两三句具体的亮点（最佳位置、最佳时间、季节看点）。详情里所有文字都写纯文本，不用 Markdown 的加粗、标题、列表\ntool-save-trip-detail-suits = 适合谁的短标签，2 到 4 个，比如“推车好走”“不用爬山”\ntool-save-trip-detail-duration = 建议玩多久，比如“1.5–2 小时”\ntool-save-trip-detail-quiet = 什么时候人少，比如“工作日、10 点前”\ntool-save-trip-detail-tickets = 门票和开放时间，一两行；只写联网查到的\ntool-save-trip-detail-reviews = 从游记、点评里摘的真实评价，最多 3 条，必须带来源；没联网就不填\ntool-save-trip-review-text = 评价原话，简短\ntool-save-trip-source-title = 来源名称，比如“杭州西湖风景名胜区官网”“马蜂窝”\ntool-save-trip-source-url = 来源网页链接\ntool-save-trip-source-date = 来源发布时间，比如“2026-09”\ntool-save-place-detail-description = 只给行程里的一站补上或更新地点详情，其余内容不动。用户让你“查一下某地的详情”时用它，不要用 save_trip 重写整份行程。先联网查清楚再调用；保存后只回一句简短的话，不要把详情再说一遍。\ntool-save-place-detail-day = 这一站在第几天，从 1 开始\ntool-save-place-detail-stop = 这一站的名称，和行程里写的一致\n\nnav-main = 主导航\ndevice-desktop = 这台电脑\ndevice-ios = iPhone\ndevice-android = 安卓手机\n\nconnection-idle = 未连接\nconnection-connecting = 连接中\nconnection-open = 已连接\nconnection-reconnecting = 重新连接中\nconnection-closed = 已断开\nconnection-waiting-for-hub = 正在连接家里的电脑…\n\nhome-greeting = 都设置好了。以后有事直接跟我说就行，手机连上后也能接着聊。\nhome-greeting-named = { $name }，都设置好了。以后有事直接跟我说就行，手机连上后也能接着聊。\nhome-greeting-suggest = 不知道从哪开始的话，可以试试这些：\nthread-new-shortcut = 新对话（⌘N）\nthread-ref-title = 引用会话 · { $title }\nthread-ref-hint = 小伴会读它的要点和最近几轮\nthread-ref-remove = 去掉这个会话\nthread-ref-pick = 打 @ 选会话\nthread-status-running = 进行中\nthread-status-done = 做完了\nthread-status-need = 需要你\nthread-new = 新对话\nthread-empty = 还没有对话\nthread-untitled = 新的对话\n\ncomposer-label = 对小伴说\ncomposer-placeholder = 想让小伴做什么，直接说\ncomposer-send = 发送\ncomposer-queued = 稍后处理\ncomposer-cancel-words = 算了|不用了|取消|别做了|停下|停\ncomposer-placeholder-busy = 回车排到后面 · 说「算了」就停下\ncomposer-stop = 停\n\nreasoning-thinking = 想了 { $seconds } 秒\nreasoning-thought = 想了 { $seconds } 秒\nreasoning-show = 看思路 ›\nreasoning-hide = 收起思路\ndraft-long-wait = 已经 { $seconds } 秒了，这件事比较久\ndraft-background = 放后台，好了叫我\ndraft-background-running = 后台进行中\ndraft-background-untitled = 后台任务\ndraft-thinking = 在想…\ndraft-elapsed = 已想 { $seconds } 秒\ndraft-failed = 没成功：{ $reason }\n\nfailure-model = 模型出了点问题\nfailure-not-configured = 还没有连接模型\nfailure-network = 网络断了\nfailure-cancelled = 已停止\nfailure-budget = 到了花费上限\nfailure-internal = 小伴内部出错了\n\nerror-unsupported-protocol = 电脑上的小伴版本不匹配，请都更新到最新版\nerror-unauthorized = 配对码不对或已过期\nerror-bad-request = 请求有误\nerror-not-found = 找不到这条内容\nerror-busy = 上一条还在回复，稍等一下\nerror-internal = 小伴内部出错了\nerror-unreachable = 连不上电脑，确认手机和电脑在同一个 Wi-Fi 下\n\npair-title = 连接家里的电脑\npair-lead = 在电脑上打开小伴 › 设置 › 设备，把显示的地址和配对码填在这里。\npair-address-placeholder = 电脑地址，比如 192.168.1.8\npair-code-placeholder = 6 位配对码\npair-submit = 连接\npair-submitting = 连接中…\n\nprovider-deepseek = DeepSeek\nprovider-mimo = 小米 MiMo\nprovider-custom = 自定义 / 中转站\nmodel-not-connected = 还没有连接模型\nmodel-current = 当前模型\n\nonboarding-hello = 嗨，我是小伴\nonboarding-local-first = 我跑在你自己的设备上，不用注册账号，聊天和记忆都不出你家。\nonboarding-pick-provider = 先给我接一个大模型：\nonboarding-recommended = 推荐\nonboarding-key-label = 密钥\nonboarding-key-placeholder = 粘贴 { $provider } 的密钥\nonboarding-show-key = 显示密钥\nonboarding-hide-key = 隐藏密钥\nonboarding-get-key = 没有密钥？去 { $provider } 申请\nonboarding-cost-note = 日常聊天大约每月几块钱，按你自己的密钥计费。\nonboarding-submit = 测试并继续\nonboarding-checking = 正在测试…\nonboarding-key-local = 密钥只存在这台电脑的钥匙串里\nfailure-invalid-key = 密钥不对，检查一下有没有复制完整\nfailure-unknown-model = 这个地址上没有这个模型，检查一下模型名\nfailure-invalid-endpoint = 接口地址不对，要以 http:// 或 https:// 开头\ncustom-description = 兼容 OpenAI 格式的接口都行，比如中转站、本机 Ollama\ncustom-api-label = 接口协议\ncustom-api-open_ai = OpenAI 兼容\ncustom-api-responses = OpenAI Responses\ncustom-api-responses-hint = 走 /responses，OpenAI 新版接口，部分 GPT 模型和套餐只支持这个\ncustom-api-anthropic = Anthropic\ncustom-api-open_ai-hint = 走 /chat/completions，大多数中转站、DeepSeek、通义、Kimi、Ollama 等都用这个\ncustom-api-anthropic-hint = 走 /v1/messages，Claude 官方接口或 Anthropic 格式的中转站\ncustom-base-url-label = 接口地址\ncustom-base-url-placeholder = https://你的中转站/v1\ncustom-model-label = 模型名\ncustom-model-placeholder = 比如 deepseek-v4-flash\ncustom-label-label = 叫它什么（可选）\ncustom-label-placeholder = 比如：我的中转站\ncustom-trust-warning = 密钥会发给这个地址，请确认你信任它。\n\nonboarding-intro = 花两分钟把我设置好，之后像聊天一样用就行。\nonboarding-privacy = 不用注册账号，数据只在你的设备上\nonboarding-progress = 第 { $step } 步，共 { $total } 步\nonboarding-back = 上一步\nonboarding-skip = 跳过\nonboarding-later = 以后再说\nonboarding-next = 下一步\nonboarding-finish = 完成，开始用\nstep-model-title = 连接模型\nstep-model-hint = 用你自己的密钥\nstep-meet-title = 认识你\nstep-meet-hint = 随便聊几句\nstep-trust-title = 放手程度\nstep-trust-hint = 替你做到哪一步\nstep-phone-title = 连接手机\nstep-phone-hint = 可以以后再说\nmodel-heading = 先给我接一个大模型\nmodel-lead = 小伴不提供模型。选一个服务商，或者填你自己的中转站。\ncustom-card-hint = 兼容 OpenAI 格式\ncustom-base-url-hint = 粘贴带 /chat/completions 的完整地址也行，会自动截掉\nfailure-unknown-model-listed = 这个地址上没有 { $model } 这个模型，检查一下模型名。中转站列出的有：{ $models }\nmeet-heading = 让小伴认识你\nmeet-lead = 随便聊几句，我会把有用的记下来。记住了什么随时能在「我 › 记忆」里改或删。\nmeet-question-preferred-name = 怎么称呼你？\nmeet-question-home-and-work = 平时在哪个城市？上班在哪？\nmeet-question-household = 家里有谁需要我一起照顾吗？\nmeet-reply-alone = 就我自己\nmeet-reply-pass = 这个先不说\nmeet-input-placeholder = 直接打字回答，回车发送\nmeet-remembered = 已记住 · { $topic }：{ $value }\nmeet-intro = 我先问你三个小问题，答不答都行，记下的东西随时能改。\nmeet-unclear = 这个我没太看懂～能换个说法再说一次吗？\nmeet-failed = { $reason }，这条还没记下，可以再发一次。\nmeet-progress = 第 { $current } 个问题，共 { $total } 个\nmeet-reading = 小伴在看你的回答\nmeet-locating = 那我看看你现在在哪\nmeet-location-guess = 定位显示你现在在{ $place }，平时住这边吗？上班在哪？\nmeet-location-note = 只用了这一次定位，没有保存坐标\nmeet-location-missing = 没拿到定位也没关系～直接告诉我你在哪个城市就好，上班地点想说也可以一起说。\nmeet-reply-guess-right = 对，就住这儿\nmeet-reply-guess-wrong = 不是\nlocation-place = { $city }{ $district }\nmeet-all-set = 好，我都记下了，接着往下吧。\nmemory-topic-preferred-name = 称呼\nmemory-topic-home-and-work = 城市和上班\nmemory-topic-household = 家里\ntrust-heading = 我可以替你做到哪一步？\ntrust-lead = 选一档就行，以后每件事、每个计划都能单独调。\ntrust-cautious-name = 谨慎\ntrust-cautious-desc = 什么都先问我，我点头才动手。\ntrust-cautious-example = 设提醒前也会先问一句。\ntrust-balanced-name = 平衡（推荐）\ntrust-balanced-desc = 查信息、设提醒、记账直接做；花钱、替你对外说话先问。\ntrust-balanced-example = 提醒直接设好；点外卖会弹确认。\ntrust-hands-off-name = 放手\ntrust-hands-off-desc = 小额固定开销也直接办，事后告诉你，随时能撤销。\ntrust-hands-off-example = 电费到期自动交，在「日常」里留记录。\ntrust-red-lines = 付款、签合同、替你联系新的人这几件事，无论选哪档都会先停下问你。\nphone-heading = 把手机也连上\nphone-lead = 手机连上以后，出门也能看提醒、确认事情。所有数据经局域网直接同步，不经过任何服务器。\nphone-step-install = 1. 在手机上安装小伴（iPhone、安卓都可以）\nphone-step-scan = 2. 打开后扫这个码；扫不了就手动输入下面两项\nphone-step-wifi = 3. 手机和电脑要连同一个 Wi-Fi\nphone-qr-label = 配对二维码\nphone-address-label = 电脑地址\nphone-code-label = 配对码 · { $time } 后失效\nphone-code-expired = 配对码已失效\nphone-refresh = 换一个配对码\nphone-waiting = 等手机来连……\nphone-connected = { $name } 已连上\nphone-no-network = 没找到局域网地址，确认电脑连着 Wi-Fi\nphone-relay-hint = 出门也想用？可以在设置里加一个自建中转。\npair-hello = 连接家里的电脑\npair-home-lead = 我住在你家里的电脑上。先在电脑上打开小伴，把显示的地址和配对码填在这里。\n\napp-mark = 伴\nnav-chat = 聊天\nnav-daily = 日常\nnav-skills = 能力\nnav-me = 我\nnav-soon = 马上就来\nsearch-label = 搜索\nsearch-placeholder = 搜聊天、记忆、文件\nthread-list-hint = 以后每件事会单独成一个对话，出现在这里。\ntime-just-now = 刚刚\ntime-yesterday = 昨天\nchat-subtitle-primary = 日常聊天 · { $model }\nhome-suggestion-umbrella = 明早提醒我带伞\nhome-suggestion-expense = 帮我记一笔：午饭 38 元\nhome-suggestion-weekend = 周末带孩子去哪玩\nworkspace-label = 工作区\nworkspace-memories = 小伴记得你\nworkspace-memories-empty = 还没记下什么，聊着聊着就有了。\nmemory-sky-count = { $count } 条\nmemory-sky-loose = 未归类\nmemory-sky-crumb-separator = ›\nmemory-sky-all = 全部\nmemory-sky-crumbs = 星空位置\nmemory-sky-label = 记忆星空，共 { $count } 条\nmemory-sky-summary = { $count } 条 · 常驻 { $pinned }\nmemory-sky-expand = 展开 ⤢\nmemory-sky-title = 记忆星空\nmemory-sky-search = 搜记忆\nmemory-sky-search-placeholder = 搜记忆，比如：过敏\nmemory-sky-hint = 拖动旋转 · 滚轮缩放 · 点星团、星系飞进去 · 双击光点飞过去 · Esc 关闭\nmemory-card-constraint = 约束\nmemory-card-pinned = 常驻\nmemory-card-meta = 用过 { $uses } 次 · { $date } 记住\nmemory-card-aliases = 别名：{ $aliases }\nmemory-card-separator = 、\nmemory-card-pin = 设为常驻\nmemory-card-unpin = 取消常驻\nmemory-card-edit = 改\nmemory-card-edit-prompt = 把记忆「{ $subject }」改成：\nmemory-card-forget = 忘掉\nmemory-graph-count = { $count } 条\nmemory-graph-glowing = { $count } 条在发光\nmemory-graph-used-title = 这次用到的记忆\nmemory-graph-few = 多聊几句，这里会慢慢亮起来\nmemory-graph-recent = 最近记住\nmemory-graph-legend = { $count } { $category }\nmemory-graph-tip = { $category } · 用过 { $uses } 次 · { $date } 记住\nmemory-category-family = 家人\nmemory-category-food = 饮食\nmemory-category-home_work = 住处和工作\nmemory-category-likes = 喜好\nmemory-category-plans = 计划\nmemory-category-other = 其他\nworkspace-memories-hint = 随时能在「我 › 记忆」里改\nworkspace-memory = { $subject }：{ $value }\nworkspace-phone = 手机\nworkspace-phone-none = 还没连接手机\nworkspace-phone-none-hint = 连上后出门也能找小伴\nworkspace-phone-connect = 连接\nworkspace-phone-connected = 已连接\npairing-dialog-title = 连接手机\ndialog-close = 关闭\nvoice-shortcut = ⌥ 空格\nvoice-start = 语音输入 · 按住 { $shortcut }\nvoice-listening = 正在听\nvoice-hint = 说完松开 { $shortcut }，或点「说完了」，文字会留在输入框里可以先改再发\nvoice-cancel = 取消\nvoice-done = 说完了\nvoice-denied-microphone = 小伴还没有麦克风权限，打开后就能说话输入了\nvoice-denied-speech = 小伴还没有语音识别权限，打开后就能说话输入了\nvoice-unavailable = 这台电脑现在用不了语音识别，先打字吧\nvoice-open-settings = 打开系统设置\nvoice-cancel-key = Esc\nrich-footnotes = 脚注\nrich-footnote-back = 回到正文\nrich-image-failed = 图片打不开\nrich-image-open = 打开链接\nrich-image-copy-link = 复制链接\nviewer-open = 放大查看 { $name }\nviewer-close = 关闭\nviewer-previous = 上一张\nviewer-next = 下一张\nviewer-copy = 复制\nviewer-save = 存到下载\nviewer-preview = 用预览打开\nviewer-open-page = 打开原网页 · { $site }\nviewer-copied = 已复制\nviewer-saved = 已存到「下载」\nviewer-failed = 没成功，再试一次\nrich-copy = 复制\nrich-copied = 已复制\ntool-name-remember = 记忆\ntool-name-weather = 天气\ntool-name-search = 搜索\ntool-name-trip = 路线\ntool-name-detail = 详情\ntool-name-page = 网页\ntrace-joiner = { " · " }\ntrace-summary = 用了 { $names }（{ $count } 步）\nmemory-saved-chip = 已记住 · { $subject }：{ $value }\ndraft-stopped = 已停止 · 点一下重新回答\ndraft-unreachable = 没连上，点一下重试\ndraft-failed-retry = { $reason }，点一下重试\ndelivered = 已送达\nreply-meta = { $time } · 用了 { $seconds } 秒\nreply-time = { $time }\nmenu-copy = 复制\nmenu-cut = 剪切\nmenu-paste = 粘贴\nmenu-select-all = 全选\nmenu-voice = 语音输入\nmenu-quote = 引用回复\nmenu-quote-selection = 引用这段回复\nmenu-new-thread-with = 用这段新开对话\nmenu-look-up = 查一查\nmenu-read-aloud = 朗读\nmenu-stop-reading = 停止朗读\nmenu-regenerate = 重新回答\nmenu-regenerate-last-only = 仅最后一条\nmenu-open = 打开\nmenu-rename = 重命名\nmenu-mark-unread = 标为未读\nmenu-delete-thread = 删除对话…\nquote-label = 引用\nquote-from-assistant = 小伴\nquote-from-user = 你\nquote-image = [图片]\nquote-table = [表格]\nquote-expand = 展开引用\nquote-collapse = 收起引用\nquote-gone = 原文已不在\nattach-add = 添加图片或文件\nattach-remove = 去掉 { $name }\nattach-too-big = 超过 20MB\nattach-too-many = 最多 9 个\nattach-vision-deepseek = 这条消息有图片，会用「DeepSeek V4 Flash 看图版」来看，同一个 Key，价格和 V4 Flash 一样\nattach-vision-mimo = 当前模型 MiMo V2.5 Pro 看不了图片。换成 MiMo V2.5 看这条吗？\nattach-vision-switch = 这条换\nattach-vision-text-only = 只发文字\nattach-drop = 松开，把 { $count } 个文件交给小伴\nattach-drop-hint = 图片、PDF、Word、表格、文本都行 · 每个不超过 20MB\nattach-read-full = { $pages } 页 · 已读取\nattach-read-on-demand = { $pages } 页 · 按需查阅\nattach-unreadable = 这种文件小伴读不了\nquote-remove = 去掉引用\nthread-unread = 有新消息\ndelete-thread-title = 删除「{ $title }」？\ndelete-thread-body = 这个对话的聊天记录会一起删掉，没法恢复。小伴记住的事不受影响。\ndelete-thread-confirm = 删除\ndialog-cancel = 取消\npanel-list-shortcut = ⌘⌥S\npanel-workspace-shortcut = ⌘⌥I\npanel-list-hide = 收起会话列表 { $shortcut }\npanel-list-show = 展开会话列表 { $shortcut }\npanel-workspace-hide = 收起工作区 { $shortcut }\npanel-workspace-show = 展开工作区 { $shortcut }\nvoice-dictation-off = 要用语音输入，先在系统设置 › 键盘里打开「听写」\nlook-up-message = 查一查\nversions-previous = 上一版\nversions-next = 下一版\nversions-count = { $current } / { $total }\ntrip-range = { $from }–{ $to }\ntrip-day = 第 { $n } 天\ntrip-weekday-0 = 周日\ntrip-weekday-1 = 周一\ntrip-weekday-2 = 周二\ntrip-weekday-3 = 周三\ntrip-weekday-4 = 周四\ntrip-weekday-5 = 周五\ntrip-weekday-6 = 周六\ntrip-month-day = { $month }/{ $day }\ntrip-sky-clear = 晴\ntrip-sky-cloudy = 多云\ntrip-sky-overcast = 阴\ntrip-sky-fog = 雾\ntrip-sky-light_rain = 小雨\ntrip-sky-rain = 中雨\ntrip-sky-heavy_rain = 大雨\ntrip-sky-snow = 雪\ntrip-sky-storm = 雷雨\ntrip-weather-range = { $sky } { $low }–{ $high }°\ntrip-weather-rain = { $sky } · 降雨 { $chance }%\ntrip-stops-joiner = { " → " }\ntrip-stops-more = { $stops } 等 { $count } 处\ntrip-open = 打开行程\ntrip-revise = 改一改\ntrip-updated = 已更新\ntrip-view-version = 看这一版\ntrip-unverified = 门票、开放时间没联网核实\ntrip-connect-search = 接上联网搜索\ntrip-mode-walk = 步行\ntrip-mode-taxi = 打车\ntrip-mode-transit = 公交\ntrip-leg = { $mode } { $minutes } 分钟\ntrip-leg-estimated = 约 { $minutes } 分钟 · { $mode }\ntrip-back = ‹ 回到对话 · { $title }\ntrip-cost = 估算花费 { $cost }\ntrip-sync-calendar = 同步日历\ntrip-copy-family = 复制给家人\ntrip-reminder = 小伴提醒：{ $text }\ntrip-open-amap = 在高德打开\ntrip-nearby-food = 附近吃的\ntrip-route = 路线\ntrip-say = 对小伴说\ntrip-say-placeholder = 对小伴说，比如：第二天别太赶，中午要午睡\ntrip-send = 发送\ntrip-old-version = 这是 { $time } 的旧版本\ntrip-back-latest = 回到最新\ntrip-toast-amap = 正在打开高德…\ntrip-toast-calendar = 已写进日历「小伴行程」· { $count } 个日程\ntrip-toast-calendar-open = 打开日历\ntrip-toast-calendar-denied = 没有日历权限\ntrip-toast-calendar-settings = 去系统设置打开\ntrip-toast-calendar-failed = 没能写进日历，稍后再试\ntrip-toast-copied = 已复制，可以粘到微信发给家人\ntrip-copy-stop = { $time } { $name }（{ $note }）\ntrip-copy-footer = 小伴排的行程\ntrip-amap-food = { $place } 附近美食\ntrip-revise-quote = { $title } · { $range }\ntrip-loading = 行程加载中…\ntrip-calendar-name = 小伴行程\nplace-close = 关闭\nplace-photos = 在高德看照片和评价\nplace-why = 为什么值得去\nplace-suits = 适合谁\nplace-duration = 建议玩多久\nplace-quiet = 人少的时候\nplace-tickets = 门票和开放时间\nplace-checked = 已联网核实 · { $date }\nplace-checked-old = { $date } 核实\nplace-source = 来源：{ $title }\nplace-unverified = 没联网核实，出发前在高德确认一下\nplace-reviews = 网友怎么说\nplace-review-source = { $title } · { $date }\nplace-replace = 换一个地方\nplace-remove = 删掉这一站\nplace-empty = 这一站还没有详情。\nplace-ask = 让小伴查一下\nplace-meta = 第 { $day } 天 · { $time }\nplace-ask-message = 查一下{ $name }的详情\nplace-replace-message = 把第 { $day } 天的{ $name }换一个地方\nplace-remove-message = 把第 { $day } 天的{ $name }删掉\nsearch-card-title = 接上联网搜索\nsearch-card-subtitle = 用 DeepSeek 的搜索查门票、开放时间、最新的活动\nsearch-card-step-1 = 到 { $platform } 登录，创建一个 API Key\nsearch-card-platform = DeepSeek 开放平台\nsearch-card-step-2 = 把 Key 粘贴到下面\nsearch-card-key = DeepSeek API Key\nsearch-card-placeholder = 粘贴 Key\nsearch-card-save = 保存\nsearch-card-verifying = 验证\nsearch-card-keychain = 只存在这台电脑的钥匙串里。\nsearch-card-skip = 先不用\nsearch-card-invalid = 这个 Key 用不了，检查一下有没有复制完整\nsearch-card-offline = 现在连不上 DeepSeek，稍后再试\nsearch-card-connected = 已接上联网搜索\nsearch-card-resuming = 小伴正在接着查…\nsearch-card-skipped = 这次先不接联网搜索\nsearch-card-skipped-hint = 以后可以在「能力」里接上\nworkspace-outputs = 产出\nworkspace-trip = { $range } · { $count } 个地方\nworkspace-open = 打开\ntool-name-locate = 定位\nplace-review = “{ $text }”\ntrip-card-meta = { $range } · { $party }\ntrip-unverified-lead = { $text } ·{ " " }\ntrip-toast-calendar-handed = 已交给日历 · { $count } 个日程，在日历里点「添加」\ntrip-toast-calendar-retry = 没打开？再试一次\ntrip-context-label = 用户正在看的行程\ntrip-context-body = 「{ $title }」第 { $version } 版。先联网查清楚：只补某一站的详情时调用 save_place_detail；要改行程安排时调用 save_trip（update 设为 true）保存完整的新行程，用户没提到的内容保持不变。保存后只回一两句话，界面会显示结果。\nstep-web_search = 搜索「{ $detail }」\nstep-web_search-plain = 搜索\nstep-read_page = 读网页 · { $detail }\nstep-read_page-plain = 读网页\nstep-weather = 查天气 · { $detail }\nstep-weather-plain = 查天气\nstep-save_trip = 整理并写回行程\nstep-save_place_detail = 写回这一站的详情 · { $detail }\nstep-save_place_detail-plain = 写回这一站的详情\nstep-remember = 记下来 · { $detail }\nstep-remember-plain = 记下来\nstep-locate = 定位\nstep-generic = 处理中\nstep-found = 找到 { $count } 条，来自 { $sources }\nstep-found-plain = 找到 { $count } 条\nstep-saved = 生成第 { $version } 版\nstep-failed-page = 打不开，换别的来源\nstep-failed = 没成功，换个办法\nstep-sources-joiner = 、\nlooking-title = 小伴在查\nlooking-elapsed = 已用 { $seconds } 秒\nlooking-stop = 停止\nlooking-slow = 比平时久一些，可能是网站打开慢，小伴还在继续\nworking-show-steps = 看每一步\nstep-thinking = 在想下一步…\nisland-step-count = 第 { $n } 步\nisland-step-line = { $text } · 第 { $n } 步\nisland-stop = 停止\nisland-pause = 暂停\nisland-resume = 继续\nisland-paused = 已暂停 · 点继续接着做\nisland-open-main = 打开主窗口\nisland-collapse = 收起\nisland-note-label = 对小伴说\nisland-note-placeholder = 补充一句，小伴下一步就会看到\nisland-hint = 你可以同时用电脑，互不影响 · 只操作你允许的应用\nisland-title-app = 正在用 { $app } · 第 { $n } 步\nisland-title = { $title } · 第 { $n } 步\nisland-title-app-background = 在后台用 { $app } · 第 { $n } 步\nisland-menu-expand = 展开\nisland-menu-home = 放回原位\nisland-menu-snooze = 隐藏，到有事再出现\nisland-menu-settings = 设置…\nisland-menu-quit = 退出小伴\nisland-open = 打开小伴\nisland-done = { $title } · { $count } 步全部完成\nisland-done-reply = { $title } · 回好了\nstep-find_apps = 查软件「{ $detail }」\nstep-find_apps-plain = 查软件\nstep-open_app = 打开 { $detail }\nstep-open_app-plain = 打开软件\nstep-matched = 找到 { $names }\nstep-matched-none = 没找到\ntool-name-apps = 软件\nstep-look_at_app = 看 { $detail } 的界面\nstep-look_at_app-plain = 看软件界面\nstep-click = 点「{ $detail }」\nstep-click-plain = 点一下\nstep-type_text = 在「{ $detail }」里输入\nstep-type_text-plain = 输入文字\nstep-press_keys = 按 { $detail }\nstep-press_keys-plain = 按键\nstep-forget = 忘掉「{ $detail }」\nstep-forget-plain = 忘掉一条记忆\nstep-history_search = 翻聊天记录「{ $detail }」\nstep-history_search-plain = 翻聊天记录\nstep-history_read = 读之前的聊天\nstep-find_threads = 找会话「{ $detail }」\nstep-find_threads-plain = 找会话\nstep-read_thread = 读另一个会话\nstep-list_threads = 看会话列表\nstep-history_outline = 看归档目录\nstep-open_subthreads = 开子会话\nstep-message_subthread = 给子会话发话\nstep-spawn_agents = 派子代理\nagents-head = 派了 { $count } 个子代理 · 同时进行\nagents-title = 子代理 · { $title }\nagents-working = 第 { $steps } 步…\nagents-done = 完成 · { $steps } 步\nstep-recall = 回忆 { $detail }\nstep-recall-plain = 回忆\nstep-do_steps = { $detail }\nstep-do_steps-plain = 连着做几步\nstep-confirm = 问你：{ $detail }\nstep-confirm-plain = 等你确认\ntool-name-operate = 操作软件\nconfirm-mouse-title = 「{ $app }」不接受后台操作，借用一下鼠标？\nconfirm-mouse-hint = 会切到这个软件点一下，约 1 秒后把鼠标和窗口还给你\nconfirm-mouse-no = 我自己来\nconfirm-mouse-once = 借用这一次\nconfirm-mouse-always = 这个软件一直可以\nconfirm-subthreads-title = 我想开 { $count } 个子会话分别去做\nconfirm-subthreads-hint = 要开子会话，需要你点头\nconfirm-subthreads-item = · { $title }\nconfirm-subthreads-no = 我自己来\nconfirm-subthreads-edit = 改一下\nconfirm-subthreads-yes = 开吧\nsubthread-cards-hint = 子会话（点进去看细节）\nsubthread-open-arrow = ›\nsubthread-report-title = 子会话汇报 · { $title }\nconfirm-allow-title = 让小伴操作「{ $app }」吗？\nconfirm-allow-hint = 第一次操作这个软件，需要你点头\nconfirm-allow-no = 不允许\nconfirm-allow-once = 只这一次\nconfirm-allow-always = 一直允许\nconfirm-action-hint = 这一步有后果，需要你点头\nconfirm-action-no = 不要\nconfirm-action-edit = 改一下\nconfirm-action-yes = 可以\nconfirm-permissions-title = 需要先开启操作电脑的权限\nconfirm-permissions-hint = 打开小伴，按提示开启\noperate-consent-title = 让小伴帮你操作这台电脑\noperate-consent-lead = 需要在系统设置里打开一项权限。开之前，先说清楚。\noperate-consent-what = 1 · 用来做什么\noperate-consent-what-body = 只在你交代任务时，替你点按钮、打字、选菜单。比如：把表格导出成 PDF、在浏览器里填好表单（提交前问你）。\noperate-consent-permissions = 2 · 要开的权限\noperate-consent-control = 辅助功能\noperate-consent-control-body = 读软件里有哪些按钮、输入框，并替你点和填。不录屏、不截图。\noperate-consent-limits = 3 · 看得到 / 不碰什么\noperate-consent-limits-body = 只碰你允许过的软件；不碰密码框、验证码、付款页、银行软件。没有任务时什么都不读。\noperate-consent-stop = 4 · 会不会打扰你\noperate-consent-stop-body = 不会抢你的鼠标和键盘，你可以同时用电脑。想让它停：灵动岛上点「暂停」或「停止」· 系统设置 › 隐私与安全性 里关掉\noperate-consent-later = 先不开\noperate-consent-open = 去系统设置开启\noverlay-click = 点「{ $label }」 · 第 { $n } 步\noverlay-type = 在「{ $label }」里输入 · 第 { $n } 步\noverlay-click-real = 用真实鼠标点「{ $label }」 · 第 { $n } 步 · 马上还你\noverlay-type-real = 用真实键盘在「{ $label }」里输入 · 第 { $n } 步 · 马上还你\noverlay-unnamed = 这里\n\nfile-open-hint = 打开 ↗\nfile-open-label = 打开 { $name }\nfile-menu-open = 打开\nfile-menu-reveal-mac = 在访达中显示\nfile-menu-reveal-windows = 在资源管理器中显示\nfile-menu-copy = 复制文件\nfile-menu-save-as = 另存为…\nfile-menu-look-again = 让小伴再看一遍\nfile-look-again = 再看一遍这个文件：{ $name }\nimage-menu-zoom = 放大查看\nimage-menu-preview-mac = 用预览打开\nimage-menu-preview-windows = 用照片打开\nimage-menu-copy = 复制图片\nimage-menu-download = 存到下载\nmenu-key-space = 空格\n\nchat-subtitle-lead = 日常聊天\nthinking-title = 思考\nthinking-auto = 自动\nthinking-none = none\nthinking-low = low\nthinking-high = high\nthinking-max = max\nthinking-auto-help = （默认）小伴按官网建议，每次看任务难度自己选 low / high / max；闲聊不思考\nthinking-none-help = 关闭思考，直接回答\nthinking-low-help = 官网建议用于简单任务\nthinking-high-help = 官网建议用于日常任务（官网默认）\nthinking-max-help = 官网建议用于高度复杂的任务，更慢更贵\nthinking-unsupported = 当前模型不支持调节思考强度\nthinking-model = 模型\nmodel-switching = 正在切换…\nmodel-switch-failed = 没切换成，稍后再试\nmodel-add = 添加别的模型…\nreply-thought = 想了 { $seconds } 秒\nreply-thought-effort = 想了 { $seconds } 秒 · { $effort }\narchive-folded = 更早的 { $count } 条已归档 · 小伴记得要点\narchive-expand = 展开 ⌄\narchive-above = 以上是归档的聊天 · 小伴读的是要点\narchive-collapse = 收起 ⌃\narchive-loading = 正在加载更早的消息…\narchive-summary = 看要点\narchive-summary-title = 小伴记得的要点\narchive-summary-count = 整理了 { $count } 次\narchive-summary-empty = 还没有要点\narchive-summary-foot = 只能看，不能改；要纠正直接跟小伴说\ncontext-trigger = 上下文 { $percent }%\ncontext-title = 这个对话的上下文\ncontext-amount = { $percent }% · 约 { $used } / { $window }\ncontext-help = 越长每次回答越慢、越贵。整理：较早的聊天写成要点交给小伴，原文还在这台电脑上，可以翻、可以搜，小伴需要细节会自己去查。\ncontext-compact = 现在整理\ncontext-compact-note = 较早的聊天写成要点，最近 10 轮保留原文\ncontext-compact-short = 聊天还不多，不用整理\ncontext-compacting = 正在整理…\ncontext-auto = 用到多少自动整理\ncontext-auto-off = 不自动\ncontext-auto-note = 对所有对话生效\ncontext-compacting-pill = 正在整理较早的聊天…\ncontext-compacting-hint = 整理时可以接着说，发的消息等整理完再回\ncontext-compacted = 整理好了 · 上下文 { $from }% → { $to }%\ncontext-compact-failed = 这次没整理成，稍后再试\nthread-menu-compact = 整理较早的聊天\nprompt-workspace = 这个对话在工作区「{ $name }」里，文件夹是 { $path }。用户让你看代码、改代码时，用 list_dir、search_files、read_file 先弄清楚，再用 edit_file 做小范围精确修改（old 要从文件里原样复制，带足上下文保证唯一），新建文件或整个重写才用 write_file；改之前一定先读过那个文件。需要跑测试、构建等命令时用 run_command，并写清理由；用户拒绝就把命令告诉他让他自己跑，不要换个说法重试。工作区外的文件读写会问用户。改完简要说明改了什么、为什么，不要把整段代码再贴一遍。git 只用来查看，提交、推送、切分支等用户明确要求了再做。提到 PR 或 Issue 时写成 #编号（如 #42），界面会把它显示成带状态的标签。\ntool-code-path = 路径，相对工作区文件夹，也可以是绝对路径或 ~ 开头；不填表示工作区根目录。\ntool-list-dir-description = 列出文件夹里的文件和子文件夹（按 .gitignore 忽略），文件夹以 / 结尾。\ntool-list-dir-depth = 往下列几层，1 到 3，默认 1。\ntool-read-file-description = 读一个文本文件，返回指定行范围的原文和总行数。一次最多 2000 行，长文件分段读。\ntool-read-file-from = 从第几行开始，默认 1。\ntool-read-file-to = 读到第几行（包含）。\ntool-search-files-description = 在工作区里搜：默认按内容搜（正则，写错会当普通文字），返回文件、行号和那一行；names 为 true 时按文件名搜。\ntool-search-files-query = 要找的内容或文件名的一部分。\ntool-search-files-names = 为 true 时只按文件名搜。\ntool-write-file-description = 新建文件，或把整个文件替换成新内容。改已有文件优先用 edit_file；覆盖已有文件前必须先 read_file。\ntool-write-file-content = 文件的完整新内容。\ntool-edit-file-description = 把文件里的一段原文精确替换成新文。old 必须和文件里的文字逐字一致（包括缩进和换行），并且在文件里只出现一次；不唯一时多带几行上下文，确实要全部替换才设 all。\ntool-edit-file-old = 要替换的原文，从文件里原样复制。\ntool-edit-file-new = 替换后的新文。\ntool-edit-file-all = 为 true 时替换所有出现的地方。\ntool-run-command-description = 在工作区文件夹里执行一条命令，返回退出码和输出（最多约 12000 字，保留结尾）。会先请用户允许，用户放行过的同类命令直接执行。不要用它读写文件或做 git 提交、推送。\ntool-run-command-command = 要执行的命令。\ntool-run-command-reason = 一句话说明为什么要执行，会显示给用户。\nworkspace-section = 工作区\nthread-section-other = 其他对话\nworkspace-new-thread = 在这里新开对话\nworkspace-new-thread-in = 在工作区里新开对话…\nworkspace-more = 更多\nworkspace-more-threads = 还有 { $count } 个 ⌄\nworkspace-add = 新工作区…\nworkspace-remove = 从列表移除\ncode-open-editor = 在编辑器里打开\nworkspace-drop = 松手把 { $name } 加为工作区\nstep-list_dir = 看目录 · { $detail }\nstep-list_dir-plain = 看目录\nstep-read_file = 读 { $detail }\nstep-read_file-plain = 读文件\nstep-search_files = 搜代码「{ $detail }」\nstep-search_files-plain = 搜代码\nstep-write_file = 写 { $detail }\nstep-write_file-plain = 写文件\nstep-edit_file = 改 { $detail }\nstep-edit_file-plain = 改文件\nstep-run_command = 运行 { $detail }\nstep-run_command-plain = 运行命令\ncode-panel = 代码\ncode-tab-changes = 改动\ncode-tab-terminal = 终端\ncode-files = 文件\ncode-files-search = 搜文件名\ncode-files-collapse = 收起文件\ncode-files-expand = 展开文件\ncode-mark-changed = 改\ncode-mark-added = 新\ncode-changes-head = 这次对话改的 { $count } 个文件\ncode-diff-unified = 合并\ncode-diff-split = 并排\ncode-open = 打开\ncode-revert-file = 撤回这个文件\ncode-revert-hunk = 撤回这块\ncode-hunk-near = @@ { $line } 行附近\ncode-new-file = 新文件\ncode-deleted-file = 已删除\ncode-binary = 二进制文件，不显示对比\ncode-no-changes = 这次对话还没改过文件。小伴改了文件后，会在这里按文件列出来，每一块都能单独撤回。\ncode-status-uncommitted = { $count } 个文件未提交\ncode-status-ahead = · 比 { $upstream } 多 { $count } 个提交\ncode-status-clean = 没有未提交的改动\ncode-status-no-git = 没用 git 管理\ncode-file-changed = 小伴改过\ncode-see-changes = 看改动\ncode-add-input = 加到输入框\ncode-copy = 复制\ncode-copy-path = 复制路径\ncode-look = 让小伴看看这个文件\ncode-look-text = 帮我看看 { $path }\ncode-file-binary = 这是二进制文件，不能显示。\ncode-file-truncated = 文件太长，只显示了前面一部分。\ncode-quote = { $path } { $from }–{ $to }\ncode-terminal-agent = 小伴 $\ncode-terminal-you = 你 $\ncode-terminal-input = 自己输入命令，回车执行\ncode-terminal-empty = 小伴和你在这个工作区跑过的命令会列在这里。\ncode-terminal-failed = ✗ 退出码 { $code }\ncode-terminal-stopped = 已停止\ncode-seconds = { $seconds } 秒\ncode-branch-changes = { $count } 个文件未提交\ncode-changed-count = 改了 { $count } 个文件\ncode-view = 查看\ncode-card-title = 这次改了 { $count } 个文件\ncode-card-view = 查看改动\ncode-card-revert-all = 全部撤回\ncode-card-reverted = 已撤回\nconfirm-run-title = 要运行命令 · 需要你允许\nconfirm-run-cwd = 在 { $cwd } 里运行\nconfirm-run-once = 允许这一次\nconfirm-run-always = 这个工作区都允许 { $rule }\nconfirm-run-no = 不允许\nconfirm-read-title = 要读工作区外的文件 · 需要你允许\nconfirm-read-always = { $folder } 这个文件夹都可以读\nconfirm-write-title = 要改工作区外的文件 · 需要你允许\nconfirm-write-always = { $folder } 都可以改\ncode-close-tab = 关闭 { $name }\ncode-added = +{ $count }\ncode-removed = −{ $count }\ncode-terminal-ok = ✓\ncode-terminal-running-for = 运行中 · { $seconds } 秒\ncode-terminal-stop = 停止\ncode-terminal-queued = 排队中\ncode-terminal-input-busy = 运行中也能接着输入，回车排在后面跑\ncode-resize = 拖动调整宽度，双击恢复默认\ncode-resize-width = { $width } px · 双击恢复默认\nbranch-menu = 切换分支\nbranch-search = 搜分支\nbranch-current = 当前 · { $count } 个文件未提交\nbranch-current-clean = 当前\nbranch-remote = 远程 { $name }\nbranch-remote-behind = 远程 { $name } · 落后 { $count }\nbranch-new = 从当前分支新建…\nbranch-new-placeholder = 新分支名，回车创建\nbranch-pull = 拉取最新（git pull）\nbranch-switch-title = 切到 { $name } 之前\nbranch-switch-body = { $branch } 上还有 { $count } 个文件没提交。\nbranch-switch-stash = 先存起来，切回来再恢复\nbranch-switch-carry = 带着改动一起切过去\nbranch-switch-hint = 「存起来」用的是 git stash，切回这个分支时小伴会提醒你恢复\nbranch-failed = 没成功：{ $detail }\nbranch-stashed = 这个分支有存起来的改动\nbranch-restore = 恢复\ncode-preview = 预览\ncode-source = 源码\ncode-image-size = { $width } × { $height } · { $size }\ncode-image-hint = 点图片放大查看 · 空格\ncode-image-failed = 这张图片打不开，可能太大或格式不支持。\ntool-git-description = 在工作区里运行 git。args 是参数列表，第一个是子命令，例如 ["status"]、["diff","--","src/a.ts"]、["log","--oneline","-n","20"]、["commit","-m","说明"]。status、diff、log、show、blame、列分支等只读命令直接执行；会改动仓库的（commit、push、switch、merge、pull、stash、reset 等）先请用户允许。用户没要求就不要提交、推送或切分支。\ntool-git-args = git 的参数列表，不含开头的 git。\ntool-gh-description = 在工作区里运行 GitHub 命令行 gh，读 PR、Issue、检查结果等。args 是参数列表，例如 ["pr","list","--state","open"]、["pr","view","42","--json","title,state,statusCheckRollup"]、["issue","view","17"]、["api","repos/:owner/:repo/pulls"]。list、view、checks、diff、status 和 api 读取直接执行；创建、合并、评论、关闭等先请用户允许。需要结构化结果时加 --json。\ntool-gh-args = gh 的参数列表，不含开头的 gh。\nstep-git = git { $detail }\nstep-git-plain = 运行 git\nstep-gh = gh { $detail }\nstep-gh-plain = 查 GitHub\nref-open = 打开\nref-draft = 草稿\nref-merged = 已合并\nref-closed = 已关闭\nref-checks-passed = 检查通过\nref-checks-failed = { $count } 个检查失败\nref-checks-pending = 检查中 { $done }/{ $total }\nref-pr-label = PR #{ $number }\nref-issue-label = Issue #{ $number }\nref-files = { $count } 个文件\nref-comments = { $count } 条评论\nref-more-checks = 还有 { $count } 项\nref-look-failure = 让小伴看看失败原因\nref-ask-failure = 看看 PR #{ $number } 的检查为什么失败，告诉我原因和怎么修。\nref-pin = 置顶到标题下\nref-unpin = 取消置顶\nref-open-browser = 在浏览器打开\nref-pins-more = 还有 { $count } 个 ⌄\nref-pins-less = 收起 ⌃\nref-pr-where = PR #{ $number } · { $repo }\nref-issue-where = Issue #{ $number } · { $repo }\nref-number = #{ $number }\nprompt-commit-message = 你在为一次 git 提交写说明。会给你这个仓库最近的提交说明（用来学它的风格和语言）、要提交的文件和改动。照仓库已有的风格写：已有提交是英文就写英文，是中文就写中文；有 feat:/fix: 这类前缀就照着用，没有就不用。第一行是简短的标题（不超过 72 个字符，说清做了什么），改动多时空一行再写一两句说明为什么。只输出提交说明本身，不要引号，不要代码块，不要别的话。\ncommit-draft-recent = 最近的提交说明：\ncommit-draft-files = 要提交的文件：\ncommit-draft-diff = 改动：\ncode-tab-git = Git\ngit-not-repo = 这个文件夹还没用 git 管理\ngit-not-repo-hint = 不影响改代码：小伴改之前会记下原样，「改动」里照样能看、能撤回。\ngit-init = 初始化 git\ngit-ahead = 基于 { $upstream } · 领先 { $ahead } · 落后 { $behind }\ngit-working = 未提交\ngit-working-files = { $count } 个文件\ngit-this-branch = 只看这个分支\ngit-all-branches = 看全部分支\ngit-commit = 提交…\ngit-commit-meta = { $short } · { $author } · { $time } · { $count } 个文件\ngit-copy-hash = 复制提交号\ngit-explain = 让小伴讲讲这次提交\ngit-explain-text = 讲讲提交 { $short } 改了什么、为什么这么改。\ngit-commit-open = 提交…\ngit-pr = 提合并请求\ngit-pr-opening = 正在推送…\ncommit-title = 提交 { $count } 个文件\ncommit-drafting = 小伴在写说明…\ncommit-placeholder = 提交说明\ncommit-hint = 说明是小伴按改动写的，可以直接改 ·\ncommit-redraft = 重新写\ncommit-message = 提交说明\ncommit-only = 提交\ncommit-push = 提交并推送\nbranch-switch-commit = 先提交再切换…\nconflict-tab = 冲突\nconflict-mark = 冲突\nconflict-number = 冲突 { $number }/{ $total }\nconflict-where = { $path } { $line } 行\nconflict-ours = 这边 · { $branch }\nconflict-theirs = 那边 · { $branch }\nconflict-incoming = 合进来的\nconflict-use-ours = 用这边\nconflict-use-theirs = 用那边\nconflict-use-both = 两边都要\nconflict-ask = 让小伴合并\nconflict-editor = 在编辑器里改\nconflict-ask-text = { $path } 第 { $line } 行附近有合并冲突（这边是当前分支，那边是 { $incoming }）。读一下两边和上下文，写一份保留两边意图的合并结果替换掉冲突标记，改完告诉我你怎么取舍的。\nconflict-banner = 正在把 { $incoming } 合进 { $branch }\nconflict-count = { $files } 个文件、{ $blocks } 处冲突\nconflict-none-left = 冲突都解决了，点右下角「完成合并」。\nconflict-left = 还剩 { $count } 个文件有冲突\nconflict-all-done = 冲突都解决了\nconflict-abort = 放弃合并\nconflict-finish = 完成合并\nconflict-abort-title = 放弃这次合并？\nconflict-abort-body = 会回到合并前的样子，已经解决的冲突也会丢掉。\nconflict-bar = 合并中 · 还剩 { $count } 个文件有冲突\nconflict-bar-done = 合并中 · 冲突都解决了\nworkspace-new-title = 新工作区\nworkspace-new-empty = 还没选文件夹\nworkspace-new-choose = 选择…\nworkspace-rule-inside = 在这个文件夹里，小伴读写文件不用问你\nworkspace-rule-ask = 读写外面的文件、执行命令、提交和推送，都会先问你\nworkspace-rule-undo = 每次改动都会记下，随时能撤回\nworkspace-new-git = 识别到 git 仓库 · 当前分支 { $branch }\nworkspace-new-no-repo = 这个文件夹没用 git 管理，改动照样能看、能撤回\nworkspace-new-no-git = 电脑上没装 git，改动照样能看、能撤回\nworkspace-new-start = 开始\nworkspace-new-hint = 也可以直接把文件夹拖进左栏\ncode-undone-file = 已撤回，恢复成改之前的样子\ncode-undone-block = 刚撤回了一块改动\ncode-restore = 恢复\nstep-ran-ok = 通过\nstep-ran-failed = 失败（退出码 { $code }）\nstep-ran-timeout = 超时停止\nstep-declined = 你没让运行\ncommand-pill-ok = { $command } 通过 · 在终端里看 ›\ncommand-pill-failed = { $command } 失败（退出码 { $code }）\ncommand-pill-timeout = { $command } 超时停止\ncommand-pill-declined = 没让运行 · { $command }\nmd-alert-note = 说明\nmd-alert-tip = 提示\nmd-alert-important = 重要\nmd-alert-warning = 注意\nmd-alert-caution = 警告\nworkspace-settings = 工作区设置…\nworkspace-settings-title = 工作区设置\nworkspace-settings-none = 还没有\nworkspace-settings-remove = 移除\nworkspace-settings-name = 名称\nworkspace-settings-place = 位置\nworkspace-settings-place-hint = 换位置请新建工作区；对话记录跟着工作区走\nworkspace-settings-editor = 用哪个编辑器打开\nworkspace-settings-editor-auto = 自动\nworkspace-settings-editor-system = 系统默认\nworkspace-settings-editor-hint = 「自动」按 Cursor、VS Code、Zed 的顺序找你装了的\nworkspace-settings-commands = 放行的命令\nworkspace-settings-commands-hint = 小伴跑这些命令开头的命令时不再问你；带 && ; | 的连环命令仍然每次问\nworkspace-settings-read = 工作区外可以读的文件夹\nworkspace-settings-write = 工作区外可以改的文件夹\nworkspace-settings-write-hint = 能改的文件夹也能读\nworkspace-settings-done = 完成\nworkspace-remove-title = 把「{ $name }」从列表移除？\nworkspace-remove-body = 只是不在左栏显示，文件夹和对话记录都不会删。\nref-table-headers = #, PR, Issue, 编号, PR 编号, Issue 编号, No., Number\nkitchen-thread-title = 厨房\nkitchen-context-label = 厨房现在的状态（冰箱、人数、忌口、推荐、买菜清单）\nprompt-kitchen = 这是厨房的对话，你帮用户决定今晚吃什么、怎么做、买什么。用户发来冰箱照片时，先认出里面的食材，用 kitchen_fridge 写下来（整张照片重拍就 replace）；然后按冰箱里有的、人数、忌口和时间，用 kitchen_dishes 给出 3 道推荐（家常、能做成、优先用快坏的食材），写清用到什么、缺什么。人数、忌口、时间从记忆里来，用户说「今天 2 个人」「想吃辣的」就用 kitchen_preferences 改，再重新推荐。缺的东西用户要买时用 shopping_add 加到买菜清单。用户说开始做时，用 cook_steps 把选中的菜排成穿插的步骤，每步写火力和计时秒数。做菜中被问到盐放多少、火候之类，按当前这一步简短回答。用户说做完了，问一句好不好吃，有值得记的口味就记下来。回答简短，不用把推荐再列一遍，界面会显示。 用户要排一周菜单时，用 week_plan 按 calendar 里的日期排晚饭：工作日照「最多花多少分钟」，周末可以复杂点，剩菜和炖的肉接着用，可以留一天外卖；列出要买的并标好买回来冷冻、冷藏还是常温，几天后才吃的肉冷冻，要解冻、要腌的写进 prep。用户说「周四换个鱼」只改那天，buy 跟着改。buy 只显示在一周菜单里，用户点「全部加到买菜清单」才会进买菜清单，别说已经加进清单了。\ntool-kitchen-fridge-description = 记下冰箱里有什么。看完冰箱照片或用户说「鸡蛋用完了」时调用。\ntool-kitchen-fridge-items = 食材列表，已有的会更新数量。\ntool-kitchen-fridge-replace = 为 true 时先清空再写（重拍了整个冰箱）。\ntool-kitchen-fridge-remove = 要从冰箱里去掉的食材名。\ntool-kitchen-item-name = 食材名，简短，如「鸡蛋」「番茄」。\ntool-kitchen-item-amount = 数量，如「8 个」「半颗」「500g」，不确定就空着。\ntool-kitchen-dishes-description = 给出今晚的推荐菜（会替换掉上一批）。一般 3 道，荤素搭配。\ntool-kitchen-dish-name = 菜名。\ntool-kitchen-dish-minutes = 大约要做多少分钟。\ntool-kitchen-dish-why = 一句话说为什么推荐，比如用掉快到期的食材、孩子爱吃。\ntool-kitchen-dish-uses = 用到的冰箱里已有的食材。\ntool-kitchen-dish-missing = 还缺的食材，带数量，如「牛腩 500g」。\ntool-kitchen-preferences-description = 改这次做饭的条件：几个人吃、忌口、最多花多少分钟。\ntool-kitchen-servings = 几个人吃。\ntool-kitchen-avoid = 忌口和不吃的东西，如「花生」「香菜」。会整体替换。\ntool-kitchen-max-minutes = 最多花多少分钟做。\ntool-shopping-add-description = 把东西加到买菜清单。\ntool-shopping-note = 备注，比如买哪种、在哪买。\nkitchen-title = 厨房\nkitchen-back = ‹ 日常\nkitchen-tab-tonight = 今晚吃什么\nkitchen-tab-shopping = 买菜清单\nkitchen-chat = 对小伴说\nkitchen-chat-note = 厨房的对话\nkitchen-chat-hint = 拍一张冰箱照片拖进来，或者说「今晚吃什么」。说「今天 2 个人」「想吃辣的」会直接改推荐。\nkitchen-chat-placeholder = 想吃点辣的、少油……\nkitchen-thinking = 在想……\nkitchen-minutes = { $minutes } 分钟\nkitchen-missing = 缺 { $items }\nkitchen-have-all = 食材都有\nkitchen-uses = 用到：{ $items }\nkitchen-joiner = 、\nkitchen-plus = { " + " }\nkitchen-photo-filter = 图片\nkitchen-photo-message = 这是冰箱现在的样子，看看有什么，今晚吃什么？\nkitchen-fridge = 冰箱里有\nkitchen-retake = 重拍 / 拖照片进来\nkitchen-add-photo = 拍冰箱 / 选照片\nkitchen-photo-empty = 还没有冰箱照片\nkitchen-photo-when = { $when } 拍的\nkitchen-item = { $name } { $amount }\nkitchen-fridge-empty = 发一张冰箱照片，或在右边说说冰箱里有什么。\nkitchen-used-hint = 蓝色的是选中的菜要用的\nkitchen-rules = 这次按\nkitchen-servings = { $count } 人份\nkitchen-servings-unknown = 人数还不知道\nkitchen-avoid = 不吃{ $items }\nkitchen-within = { $minutes } 分钟内\nkitchen-rules-hint = 来自记忆；在右边说「今天 2 个人」就会改\nkitchen-suggested = 按冰箱推荐\nkitchen-suggested-note = 都在 { $minutes } 分钟内 · 已选 { $count } 道\nkitchen-another = 换一批\nkitchen-another-batch = 换一批推荐\nkitchen-empty-title = 今晚吃什么？\nkitchen-empty-body = 拍一张冰箱照片，小伴按里面有的、几个人吃、忌口和时间推荐三道菜。\nkitchen-ask = 直接问小伴\nkitchen-ask-tonight = 今晚吃什么？\nkitchen-summary = 约 { $minutes } 分钟 · { $servings } 人份 ·{ " " }\nkitchen-summary-missing = 缺 { $count } 样\nkitchen-summary-all = 食材都有\nkitchen-add-missing = 把缺的加到买菜清单\nkitchen-start = 开始做 { $dishes }，一步步带我做。\nkitchen-start-button = 开始做 ›\nkitchen-shopping-left = 还要买 { $count } 样\nkitchen-clear-bought = 清掉已买的\nkitchen-shopping-empty = 买菜清单是空的。选好菜后点「把缺的加到买菜清单」，或者在右边说「记一下买牛奶」。\ndaily-morning = 早安\ndaily-afternoon = 下午好\ndaily-evening = 晚上好\ndaily-hello-name = { $greeting }，{ $name }\ndaily-talk = 对小伴说…\ndaily-confirm = 等你确认 · { $count }\ndaily-food = 今晚吃什么\ndaily-dot = { " · " }\ndaily-open-kitchen = 打开厨房 ›\ndaily-shopping = 买菜清单还有 { $count } 样\ndaily-food-empty = 拍一张冰箱照片，小伴帮你想今晚吃什么、缺什么要买。\ndaily-food-start = 打开厨房\ndaily-more-title = 更多会慢慢出现在这里\ndaily-more-body = 日程和提醒、计划进度、小伴替你办的事。跟小伴说「提醒我周五交房租」就能开始。\ntool-kitchen-dish-photo = 这道菜常见的英文名，用来找图片，如「Mapo tofu」「Stir-fried potato strips」。\nkitchen-listening = 在听……说完松开 ⌥ 空格，或再点一下麦克风\ntool-week-plan-description = 排或改一周晚饭菜单。整周重排就传全部 7 天和 prep、buy；只换某天就只传那天（buy、prep 有变化才传，传了会整体替换）。\ntool-week-start = 这周周一的日期，如 2026-11-02。\ntool-week-idea = 一两句话说排的思路：时长、剩菜怎么接着用、为什么留外卖日。\ntool-week-days = 每天的晚饭。\ntool-week-day-date = 日期，YYYY-MM-DD。\ntool-week-day-dish = 菜名，几道菜用「 + 」连起来；外卖日写「外卖日」。\ntool-week-day-why = 很短的理由，如「孩子爱吃」「用周日炖的牛腩」。\ntool-week-day-takeout = 这天不做饭（外卖、在外面吃）。\ntool-week-prep = 要提前做的事（腌肉、把冻肉挪到冷藏解冻），到时间会提醒用户。\ntool-week-prep-time = 提醒时间，HH:MM，如 20:00。\ntool-week-prep-text = 要做什么，一句话。\ntool-week-buy = 这周要买的食材，冰箱里已有的也列上并标 have。\ntool-week-item-note = 很短的备注，如「周二就用」「周四当天买」。\ntool-week-item-group = 分类：蔬菜水果、肉蛋、主食调料之类。\ntool-week-item-have = 冰箱里已经有了。\ntool-week-keep = 买回来放哪：frozen 冷冻（几天后才吃的肉）、chilled 冷藏、room 常温。\ntool-cook-steps-description = 用户要开始做菜时调用：把选中的几道菜排成一份穿插着做的步骤（能并行的放在一起，比如泡西兰花时切番茄），界面会进入做饭模式。\ntool-cook-minutes = 这顿饭从备菜到全部出锅大概要多少分钟，按穿插着做之后的实际时间算（泡、腌、等水开都算进去）。\ntool-cook-dishes = 这次做的菜名。\ntool-cook-step-dish = 这一步属于哪道菜。\ntool-cook-step-text = 这一步做什么，一句话，站在灶台边能看懂。\ntool-cook-step-tip = 小提示（可选），比如油温怎么判断、盐放多少。\ntool-cook-step-heat = 火力：high 大火、medium 中火、low 小火、none 不用火。\ntool-cook-step-seconds = 这一步要计时多少秒；不需要计时填 0。\ntool-cook-step-after = 计时到了要做什么，比如「捞出来过凉水」。\nheat-high = 大火\nheat-medium = 中火\nheat-low = 小火\nheat-none = 不用火\nkitchen-resume-cook = 回到做饭 ›\ncook-back = ‹ 厨房\ncook-title = 做饭\ncook-meta = { $servings } 人份 · 约 { $minutes } 分钟 · 屏幕常亮中\ncook-done = 做完了\ncook-planning = 小伴在排步骤……\ncook-steps-head = 步骤 · { $count } 道菜穿插做\ncook-check = ✓\ncook-timing = 计时中\ncook-step-n = 第 { $n } 步\ncook-progress = 第 { $n } / { $total } 步 · { $dish }\ncook-timer-label = { $dish } · 第 { $step } 步\ncook-start-timer = 开始计时 { $time }\ncook-timer-running = 计时中 { $left }\ncook-prev = ‹ 上一步\ncook-next = 下一步 ›\ncook-you-asked = 你问：{ $text }\ncook-ask-placeholder = 问小伴：火是不是太大了……\ncook-talk = 按住说话 ⌥ 空格\ncook-finished-message = 做完了。\ntimer-head = 计时器 · { $count }\ntimer-hint = 时间到会响铃、弹系统通知；切到别的页面、最小化都照样计时\ntimer-add = + 自己加一个\ntimer-label = 名字\ntimer-minutes = 分钟\ntimer-start-short = 开始\ntimer-default-label = 计时器\ntimer-done = 时间到\ntimer-ok = 知道了\ntimer-extend = +30 秒\ntimer-done-title = { $label } 时间到了\ntimer-done-body = 回厨房看看吧\ntimer-done-banner = ⏰ { $label } 时间到了\ntimer-then =  · { $after }\nkitchen-tab-week = 一周菜单\nkeep-frozen = 冷冻\nkeep-chilled = 冷藏\nkeep-room = 常温\nweek-title-this = 这周吃什么\nweek-title-next = 下周吃什么\nweek-title-other = 这一周吃什么\nweek-subtitle = { $range } · 晚饭 · 工作日 { $minutes } 分钟内，周末可以复杂点\nweek-prev = ‹ 上周\nweek-next = 下周 ›\nweek-replan = 重新排一周\nweek-today = 今天\nweek-changed = 刚换\nweek-swap = 换一道\nweek-fill = 让小伴排这天\nweek-day-label = { $weekday }（{ $date }）\nweek-idea = 小伴怎么排的\nweek-prep = 要提前做的\nweek-prep-item = { $day } { $time }：{ $text }\nweek-prep-note = 到时候会提醒你\nweek-buy = 这周要买 · { $count } 样\nweek-buy-note = 冰箱里有的已经划掉；标好了买回来放冷冻、冷藏还是常温\nweek-buy-add = 全部加到买菜清单\nweek-buy-added = 已加到买菜清单\nweek-have = 冰箱有\nweek-empty-title = 还没排这周的菜单\nweek-empty-body = 小伴按冰箱里有的、你们家的人数和忌口，排好一周晚饭和要买的东西。排完随时能换某一天。\nweek-empty-start = 帮我排这周\nweek-empty-hint = 也可以在右边说「这周想吃清淡点」「周末请朋友来吃饭」\nweek-plan-message = 帮我排 { $range } 的晚饭（这周周一是 { $start }）。\nweek-replan-message = 把 { $range } 的晚饭重新排一遍（这周周一是 { $start }）。\nweek-swap-message = { $day }的「{ $dish }」换一道。\nweek-fill-message = { $day }还没安排，帮我排一道。\nprep-due-title = 厨房提醒\nfridge-hint = 蓝色的是选中的菜要用的；移上去点 × 删掉，点名字改数量\nfridge-remove = 删掉 { $name }\nfridge-left = 还剩\nfridge-amount-placeholder = 比如 2 个、半颗\nfridge-used-up = 用完了\nfridge-used-up-shop = 用完了，加到买菜清单\nfridge-edit-hint = 回车保存数量 · Esc 关掉\nfridge-stale = 照片是 { $days } 天前的，有些可能吃掉了。点 × 删掉没有的，或者重拍一张。\nweek-gone = 没了，要买\nweek-gone-message = { $name }其实没了，要买，帮我补上数量和放哪。\nprompt-ledger = 这是记账的对话。用户说「午饭 38.5 牛肉面」「打车 25」就用 ledger_add 记下来（没说时间就是现在，说「昨天」就换成具体日期时间），回一句记了什么。发来小票照片时读出商家、金额和主要内容，按 receipt 记；混着不同类的（比如超市里有纸巾）先按主要的记，再问一句要不要拆。类别尽量用 categories_in_use 里已有的，常用的有餐饮、日用、交通、孩子、住房、医疗、娱乐、衣服、人情、其他。改、删、拆分用 recent 里的 id 调 ledger_edit / ledger_delete。用户说预算就用 ledger_budget。导入账单时，按 keys_to_categorize 给每个 key 定一个类别，用 ledger_import_categories 一次给完，然后一句话告诉用户分好了、请在弹框里看一下再记进来，不要自己去记。回答都要短，界面会显示明细。\nledger-thread-title = 记账\nledger-context-label = 记账状态\nledger-import-label = 刚导入的账单文件（已在本机解析，用户会在弹框里确认）\nledger-import-failed = 这个文件读不出账单明细。请用户确认是支付宝或微信 App 里「下载账单」导出的文件（CSV 或 Excel）。\nledger-other = 其他\ntool-ledger-add-description = 记一笔或几笔支出。\ntool-ledger-edit-description = 改一笔已记的支出（金额、名字、类别、时间），只传要改的。\ntool-ledger-delete-description = 删掉记错的支出。\ntool-ledger-budget-description = 设每月预算；传 0 表示不设。\ntool-ledger-budget-amount = 每月预算，元。\ntool-ledger-sort-description = 给导入账单里的每个 key 定类别。\ntool-ledger-sort-key = keys_to_categorize 里的原样 key。\ntool-ledger-amount = 金额，元，如 38.5。\ntool-ledger-name = 很短的名字，如「午饭 · 牛肉面」「地铁」。\ntool-ledger-category = 类别，如餐饮、日用、交通、孩子。\ntool-ledger-time = 时间，YYYY-MM-DD HH:MM；不知道就不传。\ntool-ledger-source = said 是用户说的，receipt 是从小票照片读的。\ntool-ledger-note = 备注（可选），如商家名。\ntool-ledger-id = 支出的 id。\ndaily-money = 本月花了\ndaily-money-budget = / 预算 { $amount }\ndaily-money-empty = 还没记过账。跟小伴说「午饭 38」，或者导入支付宝、微信的账单就能开始。\ndaily-open-ledger = 打开账本 ›\nledger-title = 记账\nledger-prev = ‹\nledger-next = ›\nledger-prev-month = 上个月\nledger-next-month = 下个月\nledger-spent = { $month } 月已花\nledger-left = 还剩 { $amount }\nledger-over = 已超 { $amount }\nledger-pace-even = { " · " }按现在的节奏月底刚好够\nledger-pace-save = { " · " }按现在的节奏月底还能剩 { $amount }\nledger-pace-over = { " · " }按现在的节奏月底会超 { $amount }\nledger-past-left = 这个月结余 { $amount }\nledger-past-over = 这个月超了 { $amount }\nledger-budget = 预算 { $amount }\nledger-no-budget = 还没设预算\nledger-budget-edit = 改\nledger-budget-set = 设一个\nledger-budget-label = 每月预算 ¥\nledger-by-category = 按类别\nledger-filter-hint = 点一类只看它\nledger-filter-on = 只看「{ $category }」· 再点取消\nledger-noticed = 它注意到\nledger-noticed-up = { $category }比上月同期多花了 { $amount }（多 { $pct }%）。\nledger-open-week = 看看这周菜单\nledger-mute = 不用提醒这个\nledger-flow-head = { $scope } · { $month } 月 · { $count } 笔\nledger-all = 全部\nledger-search = 搜一笔……\nledger-import = 导入账单\nledger-flow-empty = 这个月还没有记录。\nledger-flow-hint = 鼠标移到一笔上可以改、删；拖小票照片或账单文件到窗口任意位置都能记\nledger-today = 今天\nledger-yesterday = 昨天 { $date }\nledger-source-said = 说的\nledger-source-receipt = 小票\nledger-source-import = 账单导入\nledger-edit = 改\nledger-delete = 删\nledger-save = 保存\nledger-cancel = 取消\nledger-edit-name = 名字\nledger-edit-category = 类别\nledger-edit-amount = 金额\nledger-app-alipay = 支付宝账单\nledger-app-wechat = 微信账单\nledger-import-meta = { $app } · { $from }–{ $to } · { $count } 笔\nledger-import-summary = 小伴分好了类：新的 { $fresh } 笔会记进来；{ $dup } 笔和你已经记的重复，跳过；{ $skipped } 笔转账、退款和收入先不记，勾上就会记。\nledger-import-sorting = 小伴在分类……\nledger-import-note = 类别可以点开改 · 文件只在这台电脑上读，不会上传\nledger-import-commit = 记进来 { $count } 笔\nledger-status-new = 新的\nledger-status-duplicate = 已经记过\nledger-status-transfer = 转账，先不记\nledger-status-refund = 退款，先不记\nledger-status-income = 收入，先不记\nledger-empty-title = 还没有记过账\nledger-empty-body = 三种方式，随便用：\nledger-empty-say = 在右边说「午饭 38」「打车 25」\nledger-empty-receipt = 把小票照片拖进来\nledger-empty-bill = 导入支付宝 / 微信导出的账单文件（在它们 App 里「账单 → 下载账单」，发到电脑上）\nledger-empty-import = 导入账单文件\nledger-empty-budget = 设个月预算\nledger-bill-filter = 账单文件\nledger-import-message = 导入这份账单。\nledger-receipt-message = 记一下这张小票。\nledger-chat-note = 记账的对话\nledger-chat-hint = 说「午饭 38.5 牛肉面」就记一笔；拖小票照片或账单文件进来也行。\nledger-chat-placeholder = 午饭 38、打车 25……\nledger-cat-dining = 餐饮\nledger-cat-household = 日用\nledger-cat-transport = 交通\nledger-cat-kids = 孩子\nledger-cat-housing = 住房\nledger-cat-health = 医疗\nledger-cat-fun = 娱乐\nledger-cat-clothes = 衣服\nledger-cat-gifts = 人情\nledger-cat-other = 其他\nledger-picker = 选时间\nledger-picker-label = { $title } ▾\nledger-picker-month = 按月\nledger-picker-range = 按日期范围\nledger-year = { $year } 年\nledger-prev-year = 上一年\nledger-next-year = 下一年\nledger-month-short = { $month } 月\nledger-month-none = 没记录\nledger-picker-month-hint = 每格是那个月花了多少；以后的月份不能选\nledger-preset-week = 本周\nledger-preset-last-week = 上周\nledger-preset-7 = 最近 7 天\nledger-preset-30 = 最近 30 天\nledger-preset-year = 今年\nledger-range-days = { $range } · { $days } 天\nledger-range-go = 看这几天\nledger-picker-range-hint = 点开始日，再点结束日\nledger-picker-range-note = 点开始日、再点结束日；小点表示那天有记录；可以跨月\nledger-prev-range = 往前一段\nledger-next-range = 往后一段\nledger-range-spent = { $range } 花了\nledger-range-count = { $days } 天\nledger-range-daily = 日均 { $amount }\nledger-range-more = 比前 { $days } 天多 { $amount }\nledger-range-less = 比前 { $days } 天少 { $amount }\nledger-flow-head-range = { $scope } · { $range } · { $count } 笔\nledger-this-month = 回到本月\nweather-home = 家\nweather-sky-clear = 晴\nweather-sky-cloudy = 多云\nweather-sky-overcast = 阴\nweather-sky-fog = 雾\nweather-sky-light-rain = 小雨\nweather-sky-rain = 中雨\nweather-sky-heavy-rain = 大雨\nweather-sky-snow = 雪\nweather-sky-storm = 雷雨\nweather-mon = 周一\nweather-tue = 周二\nweather-wed = 周三\nweather-thu = 周四\nweather-fri = 周五\nweather-sat = 周六\nweather-sun = 周日\nweather-tip-rain = { $hour } 点后有雨（{ $chance }%），出门带伞\nweather-tip-rain-peak = { $hour } 点前后最大，下雨的可能 { $chance }%\nweather-tip-cold = 明天比今天冷 { $drop }°，注意加衣\nweather-tip-cold-detail = 明天 { $low }° – { $high }°\nweather-tip-sun = { $day }晴，适合晒被子\nweather-tip-sun-detail = 10 点到 15 点阳光最好\nweather-tip-air = 空气不好（指数 { $aqi }）\nweather-tip-air-detail = 少开窗，出门戴口罩\nweather-alert-summary = 今天 { $low }°–{ $high }°，{ $sky }\nweather-alert-rain = 要下雨了\nweather-alert-rain-body = { $hour } 点开始下，{ $peak } 点前后最大（{ $chance }%），出门带伞。\nweather-alert-raining = 下雨了\nweather-title = 天气\ndaily-open-weather = 打开 ›\nweather-degrees = { $value }°\nweather-percent = { $value }%\nweather-now = 现在\nweather-hour = { $hour }:00\nweather-now-line = { $sky } · 体感 { $feels }°\nweather-sky-range = { $sky } · { $low }° – { $high }°\nweather-today = 今天\nweather-range = { $low }° – { $high }°\nweather-air = 空气\nweather-aqi = { $level } { $value }\nweather-aqi-1 = 优\nweather-aqi-2 = 良\nweather-aqi-3 = 轻度污染\nweather-aqi-4 = 中度污染\nweather-aqi-5 = 重度污染\nweather-aqi-6 = 严重污染\nweather-sun-times = 日出 / 日落\nweather-uv = 紫外线\nweather-uv-1 = 弱\nweather-uv-2 = 中等\nweather-uv-3 = 强\nweather-uv-4 = 很强\nweather-uv-5 = 极强\nweather-hours = 接下来 24 小时\nweather-hours-note = 橙线是气温，蓝柱是下雨的可能\nweather-tips = 小伴提醒你\nweather-days = 未来 7 天\nweather-rules = 什么时候提醒我\nweather-rule-today = 今天的天气\nweather-rule-today-note = 你今天第一次用电脑时发一条：几度、要不要带伞、比昨天冷还是热。几点起床都一样。\nweather-rule-today-fixed = 每天这个时间发一条：几度、要不要带伞。\nweather-rule-rain = 快下雨了\nweather-rule-rain-note = 雨来前 1 小时提醒；你没在用电脑（睡觉、出门）就不打扰，攒到下次你回来时说。\nweather-rule-rain-fixed = 雨来前 1 小时提醒（早 7 点到晚 11 点之间）。\nweather-rule-cold = 明天降温\nweather-rule-cold-note = 晚上你还在用电脑时提醒一次（比今天低 5° 以上）。\nweather-rule-cold-fixed = 比今天低 5° 以上时，在这个时间提醒。\nweather-rule-air = 空气变差\nweather-rule-air-note = 空气指数超过 150、而你正在用电脑时提醒。\nweather-rhythm = 小伴看到你最近一般 { $start } 开始用电脑、{ $end } 前后离开。\nweather-rhythm-learning = 小伴还在了解你一般几点开始用电脑，过几天这里会写出来。\nweather-rhythm-make-fixed = 改成固定时间\nweather-rhythm-fixed = 现在按固定时间提醒。\nweather-rhythm-follow = 改回跟着我用电脑的节奏\nweather-rhythm-unsupported = 这台电脑看不到键盘鼠标有没有在动，按固定时间提醒。\nweather-place = { $city } · { $label }\nweather-add-tab = ＋ 加一个地方\nweather-add = 加一个地方\nweather-city-placeholder = 输入城市……\nweather-add-label = 叫它\nweather-add-go = 加上\nweather-add-note = 可以搜到区、街道、小区；地名来自 OpenStreetMap。最多 5 个；提醒只按「家」发\nweather-updated = { $time } 更新 · 数据来自 Open-Meteo\nweather-none = 还不知道你在哪个城市。输入城市，或者允许定位一次（只用来查天气）。\nweather-none-failed = 没找到。换个写法试试，比如「北京」「杭州」。\nweather-locate = 定位一次\nweather-failed = 天气暂时取不到，过一会儿再看。\nweather-loading = 正在取天气……\nweather-place-active = { $name } ▾\nweather-place-placeholder = 搜区、街道或小区……\nweather-use-here = 用现在的定位\nweather-use-here-where = · { $place }\nweather-menu-name = 名字\nweather-menu-where = 位置\nweather-menu-located = 定位得到 · 精确到约 1 公里\nweather-menu-searched = 搜索得到\nweather-menu-move = 换个位置\nweather-menu-here = 用现在的定位\nweather-menu-home-note = 提醒按这个地方发\nweather-menu-make-home = 设为家\nweather-menu-remove = 删掉这个地方\nplan-context-label = 这个对话的计划（[序号|状态|日期] 步骤）\nplan-approved = 用户点了「就这么办」，确认了计划「{ $title }」第 { $version } 版。现在开始执行：按顺序做每一步，开始做时用 plan 的 update 把这一步标成 running，做完标 done，有产出（文档、表格、PPT、要点）就填 output。中途不要逐步问用户；小的调整自己决定，用 update 的 note 记一句原因。只有要超出说好的范围（截止时间、要花钱、要替用户对外发消息）或者做不下去时，才用 ask 停下来，给两三个选项。全部做完后用一两句话告诉用户结果，以及还需要用户自己做的事。\nplan-continue = 接着执行计划的下一步，规则和刚才一样。\nplan-resumed = 用户让暂停的计划继续执行，从还没做完的步骤接着做。\nplan-chosen = 用户对你停下来问的事选了：{ $option }。按这个继续执行计划。\nplan-step-done = 用户说第 { $step } 步「{ $title }」已经做完了，接着执行计划。\nplan-stuck = 停在第 { $step } 步，需要你说一下怎么继续\ntool-plan-description = 管理这个对话的计划。事情有好几个阶段、要分几步完成时（用户让你「排个计划」、准备汇报、搬家、旅行准备等），先用 propose 出一份计划草稿。计划里只放你自己能做的步骤，每一步写清楚标题和日期；只有用户本人能做的事（到场、付钱、签字、亲自过一遍）不要放进计划，在回复里提一句就行。bounds 写明说好的范围（截止时间、预算、不替用户发消息等）。出完草稿只用一两句话说明，等用户点「就这么办」再开始，用户说改就再 propose 一版并写 changes。执行时用 update 更新步骤状态、产出和调整说明；只有超出 bounds 或做不下去时用 ask。全部做完后计划卡片会自动消失。简单的一两步小事不要建计划。\ntool-plan-title = 计划的名字，比如「周五客户汇报」\ntool-plan-bounds = 说好的范围，比如「周五 10:00 前做完；不替用户发任何消息」\ntool-plan-changes = 和上一版比改了什么，一句话\ntool-plan-step-title = 这一步做什么，简短\ntool-plan-step-due = 日期或时间，比如「周三」「11/6」「周四下午」\ntool-plan-step-detail = 补充说明（可选）\ntool-plan-step = 第几步，从 1 开始\ntool-plan-note = 这一步的调整或说明，一句话，比如「客户换了 CEO，提纲加了一页」\ntool-plan-output-label = 产出的名字，只写名字，不要加「文档」「表格」「PPT」这类前缀，比如「Q3 汇报提纲」「6 条要点」\ntool-plan-output-id = 文档、表格或 PPT 的 id（工具返回过的话）\ntool-plan-question = 要用户决定的事，说清楚为什么停下来\ntool-life-description = 读或改用户的生活页面：summary 看本月花了多少、今晚 / 这周吃什么、买菜清单、家里的天气；add_expense 记一笔支出；add_shopping 往买菜清单加东西。用户在这里随口说「午饭 38」「记一下买牛奶」时直接用它，不用让用户去别的页面。\nhome-context-label = 用户的家（天气页设的；问天气没说地方就用这里）\ndaily-arrange = 整理\ndaily-arrange-done = 完成\ndaily-arrange-hint = 拖动 ⋮⋮ 换位置\ndaily-drag = 拖动「{ $title }」换位置\ndaily-drop-here = 放到这里\ndaily-size = 宽窄\ndaily-narrow = 窄\ndaily-wide = 宽\ndaily-hide = 隐藏\ndaily-hidden = 隐藏的卡片\ndaily-hidden-none = 没有\ndaily-show = { $title } ＋\ndaily-reset = 恢复默认\ndaily-card-confirm = 等你确认\nprompt-doc = 这是一篇文档的对话，文档的全部内容（每段带 id）在背景说明里。用户让整篇或某几处改时，用 doc_edit：replace 换掉某段（可以一段换成几段）、insert_after 在某段后面加、delete 删掉；加新的一节用 insert_after 加一个 h2 再跟正文。用户选中一段让你「说人话 / 缩短 / 扩写 / 举个例子 / 改语气」时，用 doc_suggest 给出这一段的新写法，由用户决定用不用。改完回一句话，不要把内容再贴一遍。\ndoc-context-label = 文档《{ $title }》的全部内容（[段落 id|类型] 文字）\ndoc-version-first = 小伴写的初稿\ndoc-version-user = 你手改了一些地方\ndoc-version-restored = 回到第 { $version } 版\ntool-doc-start-description = 要写的东西超过一屏（清单、方案、周报、合同要点、说明、文章）时，写成一篇文档而不是长回复：先调用这个给出标题和各节标题，再对每一节调用 doc_section。短回答照常直接说。\ntool-doc-title = 文档标题。\ntool-doc-subtitle = 一句话副标题，比如写给谁、多长（可选）。\ntool-doc-sections = 各节的标题，按顺序，如「一、看房时核对的 6 件事」。\ntool-doc-section-description = 写文档的一节：这一节的标题和正文段落。按 doc_start 给的顺序一节一节写。\ntool-doc-id = doc_start 返回的 doc_id。\ntool-doc-heading = 这一节的标题。\ntool-doc-kind = 段落类型：p 普通段落、bullet 无序列表的一项、number 有序列表的一项、h3 小标题、quote 引用。\ntool-doc-text = 文字，重点可以用 **加粗**。\ntool-doc-edit-description = 改文档：一次给出所有改动。改完会存成新的一版，改过的地方标绿给用户看。\ntool-doc-note = 一句话说这次改了什么，会显示在版本记录里。\ntool-doc-op = replace 替换、insert_after 在这段后面插入、delete 删除。\ntool-doc-block-id = 段落 id（背景说明里方括号中的第一个值）。\ntool-doc-suggest-description = 用户选中一段让你改写时，给出这一段的新写法（不直接改，让用户选）。\ntool-doc-action = 用户要的改法，如「说人话」「缩短」。\ntool-doc-after = 这一段改写后的完整文字。\ndoc-icon = 文\ndoc-writing = 在写第 { $n } 节 / 共 { $total } 节\ndoc-watch = 打开看着它写\ndoc-meta = 文档 · 约 { $chars } 字 · { $sections } 节\ndoc-open = 打开 ›\ndoc-more-sections = 还有 { $count } 节\ndoc-export-word = 导出 Word\ndoc-export-pdf = 导出 PDF\ndoc-open-word = 用 Word 打开\ndoc-back = ‹ 回到对话\ndoc-version = 第 { $version } 版 ▾\ndoc-version-name = 第 { $version } 版\ndoc-saved = { $chars } 字 · 已自动保存\ndoc-export = 导出 ▾\ndoc-outline = 大纲\ndoc-outline-hint = 拖动可以调整章节顺序\ndoc-mark-undo = 撤回\ndoc-mark-keep = 保留\ndoc-act-plain = 说人话\ndoc-act-shorter = 缩短\ndoc-act-longer = 扩写\ndoc-act-example = 举个例子\ndoc-act-tone = 改语气 ▾\ndoc-tone-formal = 更正式\ndoc-tone-warm = 更亲切\ndoc-tone-simple = 更简洁\ndoc-act-ask-more = 问小伴…\ndoc-act-ask = 问小伴\ndoc-act-ask-placeholder = 想怎么改这段？回车发\ndoc-ask-action = 这段「{ $action }」\ndoc-ask-question = 关于选中的这段：{ $question }\ndoc-selected-label = 用户选中的段落\ndoc-selected-body = 段落 id：{ $id }；选中的文字：{ $selected }；整段：{ $paragraph }；想要：{ $action }。用 doc_suggest 给出这一段的新写法。\ndoc-suggestion-head = 「{ $action }」· { $where }…\ndoc-use = 用这个\ndoc-another-button = 再换一种\ndoc-another = 再换一种写法\ndoc-keep-original = 不改\ndoc-chat-note = 这篇文档的对话\ndoc-chat-hint = 说「整篇口语一点」「加一节……」就会改；也可以在左边选中一段让我改。\ndoc-chat-placeholder = 让小伴改：整篇更口语一点、加一节……\ndoc-comparing = 在看第 { $version } 版比第 { $previous } 版改了哪些（绿色是改过或新加的，划掉的是删了的）\ndoc-compare-exit = 退出对比\ndoc-compare = 和上一版对比\ndoc-restore = 回到这一版\ndoc-format-word = Word 文档\ndoc-format-pdf = PDF（打印成 PDF）\ndoc-format-md = Markdown\ndoc-format-copy = 复制全文\ndoc-export-note = 存到「下载」，导出后在访达里显示\ndoc-marks-count = 小伴这次改了 { $count } 处（标绿的地方）\ndoc-marks-keep-all = 全部保留\ndoc-marks-undo-all = 全部撤回\nprompt-sheet = 这是一张表格的对话，表格内容在背景说明里：每行开头是行号，列从 A 开始数；公式显示为「结果 [=公式]」。用户要改时用 sheet_edit，一次给出所有改动：set 从某个格子开始写一块（每行一个数组，可以写 = 开头的公式，比如 =F2*3、=SUM(B2:B9)、=MIN(F2:F8)，能用公式就用公式，原数据改了会跟着变）；insert_rows / insert_cols 在某格的行或列前插入；delete_rows / delete_cols 删掉某个范围；sort 按某列排序（第一行是表头不动）；add_tab 加一张表；rename_tab 改表名；chart 画图（labels 是名字所在的范围，values 是数字所在的范围）。改完回一句话，不要把表格再贴一遍。\nsheet-context-label = 表格《{ $title }》的内容\nsheet-version-first = 小伴做的第一版\nsheet-version-imported = 从你发来的文件打开\ntool-sheet-create-description = 用户要的是表格（比价、清单、预算、对比、名单、排班……），或数据多于几行时，做成一张表而不是在聊天里画表格。一次给出全部数据，可以有几张表；需要计算的格子写成 = 开头的公式。\ntool-sheet-title = 表格的标题。\ntool-sheet-tab = 工作表的名字。\ntool-sheet-rows = 每行一个数组，第一行是表头；需要计算的格子写 = 开头的公式（如 =F2*3、=SUM(B2:B9)）。\ntool-sheet-edit-description = 改表格：一次给出所有改动，改完存一版，改过的格子标绿。\ntool-sheet-op = set 写一块、insert_rows / insert_cols 插入、delete_rows / delete_cols 删除、sort 排序、add_tab 加表、rename_tab 改表名、chart 画图。\ntool-sheet-cell = 格子位置，如 H1；insert_rows 用这一行，insert_cols / sort 用这一列。\ntool-sheet-range = 范围，如 F2:F8。\nsheet-icon = 表\nsheet-meta = 表格 · { $rows } 行 × { $cols } 列 · { $tabs } 个表\nsheet-more-rows = 还有 { $count } 行\nsheet-export-excel = 导出 Excel\nsheet-export-csv = 导出 CSV\nsheet-open-excel = 用 Excel 打开\nsheet-open-in-xiaoban = 在小伴里打开\nsheet-saved = { $tabs } 个表 · 已自动保存\nsheet-formula = 当前格子的内容\nsheet-computed = 算出来的，原数据改了会跟着变\nsheet-marks-count = 小伴这次改了 { $count } 格（标绿的地方）\nsheet-row-above = 在上面插一行\nsheet-row-below = 在下面插一行\nsheet-row-delete = 删掉这 { $count } 行\nsheet-col-left = 在左边插一列\nsheet-col-right = 在右边插一列\nsheet-col-delete = 删掉这 { $count } 列\nsheet-sort = 排序 ▾\nsheet-sort-asc = 按这列从小到大\nsheet-sort-desc = 按这列从大到小\nsheet-draw = 画图\nsheet-lowest = 标出最低\nsheet-mark-lowest = 在 { $range } 里标出最低的。\nsheet-ask-range = 关于 { $range }：{ $question }\nsheet-chart = 图表\nsheet-chart-line = 换成折线\nsheet-chart-bar = 换成柱状\nsheet-chart-pie = 换成饼图\nsheet-chart-remove = 删掉\nsheet-tab-rename = 改名字\nsheet-tab-delete = 删掉这张表\nsheet-tab-add = 加一张表\nsheet-tab-plus = ＋\nsheet-tab-new = 表 { $n }\nsheet-status-count = 选中 { $count } 格\nsheet-status-sum = 合计 { $value }\nsheet-status-avg = 平均 { $value }\nsheet-status-min = 最低 { $value }\nsheet-status-hint = 双击改，= 开头写公式；选中几格看合计\nsheet-chat-note = 这张表的对话\nsheet-chat-hint = 说「按价格排序」「加一列 3 个人一共多少钱」就会改；也可以选中几格让我处理。\nsheet-chat-placeholder = 让小伴改：按价格排序、加一列……\nsheet-format-xlsx = Excel 表格\nsheet-format-csv = CSV（只导出当前这张表）\nsheet-format-copy = 复制当前这张表\nsheet-export-note = 公式、加粗表头、图表都会保留在 .xlsx 里\nprompt-slides = 这是一份 PPT 的对话，所有页面（带页码）在背景说明里。用户让改时用 slides_edit：replace 换掉第几页、insert_after 在第几页后面加（0 表示放最前）、delete 删掉、move_after 把第几页挪到另一页后面；只说「第 4 页」就只改那一页。也能改 theme（主题）和 transition（翻页效果）。版式按内容选：步骤用 flow，几个日期用 timeline，A 和 B 对比用 compare，比例逐层变少用 funnel，几个特点用 icons（每项配图标），金句用 quote，一个关键数字用 number，数据用 chart。每页字少：要点不超过 5 条、每条一句话；细节写进 notes。改完回一句话，不要把内容再贴一遍。\nslides-context-label = PPT《{ $title }》的全部页面\nslides-version-first = 小伴做的第一版\ntool-slides-start-description = 用户要 PPT、幻灯片、演示稿、汇报材料时，先调用这个给出标题、主题和每一页的标题，再对每一页调用 slides_page。\ntool-slides-title = PPT 的标题。\ntool-slides-theme = 主题：blue 简洁蓝、green 沉稳绿、orange 暖橙、night 夜间。\ntool-slides-pages = 每一页的标题，按顺序。第一页一般是封面。\ntool-slides-page-description = 写 PPT 的一页，按 slides_start 给的顺序一页一页写。\ntool-slides-deck-id = slides_start 返回的 deck_id。\ntool-slides-layout = 版式：title 封面、bullets 要点、number 一个大数字、chart 图表、two 左右两栏、section 章节页、flow 流程步骤、timeline 时间线、compare 对比卡片、funnel 漏斗、icons 图标网格、quote 金句。\ntool-slides-page-title = 这一页的标题（quote 版式写金句本身）。\ntool-slides-subtitle = 副标题（封面写日期和作者；number 写数字下面的说明；quote 写出处）。\ntool-slides-items = 要点 / 步骤 / 时间点 / 漏斗层 / 图标格。text 是主文字，note 是小字说明（时间线的日期、漏斗的比例），value 是 number 版式的大数字，icon 是图标名。\ntool-slides-columns = two 和 compare 版式的左右两栏，各有标题和几条内容。\ntool-slides-chart = chart 版式的数据：bar 柱状、line 折线、pie 饼图；highlight 是要突出的那一个的序号（从 0 开始）。\ntool-slides-image = 想配一张照片时写英文或中文关键词（会从免费图库找），不需要就不写。\ntool-slides-notes = 演讲备注：讲这一页时要说的话。\ntool-slides-edit-description = 改 PPT：一次给出所有改动。改过的页会显示前后对比，用户可以选用哪一版。\ntool-slides-op = replace 替换、insert_after 在后面插入、delete 删除、move_after 移动到另一页后面（to 是那一页的页码，0 表示最前）。\ntool-slides-page-number = 页码，从 1 开始（insert_after 可以用 0 表示放最前）。\nslides-icon = 演\nslides-writing = 在做第 { $n } 页 / 共 { $total } 页\nslides-meta = PPT · { $pages } 页 · 主题「{ $theme }」\nslides-top-meta = { $pages } 页 · 主题「{ $theme }」▾\nslides-theme-blue = 简洁蓝\nslides-theme-green = 沉稳绿\nslides-theme-orange = 暖橙\nslides-theme-night = 夜间\nslides-present = ▶ 演示\nslides-export-pptx = 导出 PPTX\nslides-export-pdf = 导出 PDF\nslides-open-powerpoint = 用 PowerPoint 打开\nslides-pages = 所有页面\nslides-add = ＋ 加一页\nslides-new-title = 新的一页\nslides-new-point = 写点什么\nslides-duplicate = 复制这一页\nslides-delete = 删掉这一页\nslides-notes = 演讲备注\nslides-notes-placeholder = 讲这一页时要说的话\nslides-empty = 还没有页面\nslides-chat-note = 这份 PPT 的对话\nslides-chat-hint = 说「第 3 页换成折线图」「字都少一点」「后面加一页总结」就会改；也可以点页面上的一块让我改。\nslides-chat-placeholder = 对第 { $n } 页说：换成折线图、字少一点……\nslides-ask-page = 第 { $n } 页：{ $text }\nslides-part-title = 标题\nslides-part-subtitle = 副标题\nslides-part-body = 内容\nslides-part-chart = 图表\nslides-part-image = 图片\nslides-act-shorter = 把{ $part }改短一点\nslides-act-reword = 把{ $part }换个说法\nslides-reword = 换个说法\nslides-chart-bar = 换成柱状图\nslides-chart-line = 换成折线图\nslides-chart-pie = 换成饼图\nslides-highest = 标出最高\nslides-layout = 换个版式 ▾\nslides-layout-title = 封面\nslides-layout-bullets = 要点\nslides-layout-number = 大数字\nslides-layout-chart = 图表\nslides-layout-two = 左右两栏\nslides-layout-section = 章节页\nslides-layout-flow = 流程\nslides-layout-timeline = 时间线\nslides-layout-compare = 对比卡片\nslides-layout-funnel = 漏斗\nslides-layout-icons = 图标网格\nslides-layout-quote = 引用页\nslides-image-add = 配一张图\nslides-image-change = 换一张图\nslides-image-remove = 删掉图片\nslides-image-placeholder = 关键词，比如「团队协作」\nslides-image-search = 找图\nslides-image-note = 从维基共享找免费可商用的照片，会标上作者和许可\nslides-edit-hint = 回车保存 · Esc 取消\nslides-edit-body-hint = 一行一条，「|」后面是小字；两栏版式用空行分开两栏。⌘ 回车保存\nslides-change-head = 第 { $n } 页 · 上一版 / 这一版\nslides-change-new = 新加的第 { $n } 页\nslides-keep = 用这一版\nslides-undo = 回到上一版\nslides-undo-new = 不要这一页\nslides-versions-hint = 点一版就回到那一版（会另存为新的一版，不会丢）\nslides-transition = 翻页效果\nslides-transition-fade = 淡入\nslides-transition-push = 推入\nslides-transition-zoom = 缩放\nslides-transition-none = 不要\nslides-theme-note = 换主题只换颜色、字体和背景装饰，每页的字和图不动\nslides-format-pptx = PowerPoint\nslides-format-pdf = PDF（打印成 PDF，每页一张）\nslides-format-png = 图片（每页一张 PNG）\nslides-export-note = .pptx 里文字都能再改，图表是 PowerPoint 自带的图表\nslides-next = 下一页\nslides-present-progress = { $n } / { $total } · { $time }\nslides-no-notes = 这一页没写备注\nslides-next-page = 下一页：{ $title }\nslides-last-page = 最后一页了\nslides-present-keys = ← → 翻页 · N 显示 / 收起备注 · Esc 退出\nplan-sub-draft = 草稿 · 第 { $version } 版，点「就这么办」才开始\nplan-sub-done = 全部做完了\nplan-sub-blocked = 停下来了，等你定\nplan-sub-paused = 暂停了\nplan-sub-doing = 小伴在做：{ $step }\nplan-output-doc = 文档\nplan-output-sheet = 表格\nplan-output-deck = PPT\nplan-output-text = 要点\nplan-step-doing = 正在做\nplan-adjusted = 调整\nplan-draft-tag = 草稿 · 第 { $version } 版\nplan-bounds = 说好的：{ $bounds }\nplan-approve = 就这么办\nplan-draft-hint = 想改直接说，比如「问题准备 20 个」\nplan-dismiss = 不要这个计划\nplan-blocked-title = { $title } · 停下来了\nplan-reply = 回到对话说\nplan-undock = 放回顶部\nplan-collapse = 收起 ⌃\nplan-expand = 展开 ⌄\nplan-resume = 继续\nplan-pause = 暂停\nplan-dock = 放到右边\ndaily-plans = 计划\ndaily-plans-count = { $count } 个在做\ndaily-plans-empty = 让小伴「排个计划」，进度会出现在这里\nplan-ring = { $done }/{ $total }\nplan-output-prefixes = 文档|表格|表|PPT|幻灯片|演示\ntab-chats = 聊天\ntab-daily = 日常\ntab-skills = 能力\ntab-me = 我\nchats-all = 全部\nchats-confirm = 等我确认 · { $count }\nchats-running = 进行中 · { $count }\nchats-tag-confirm = 等你确认\nchats-tag-running = 进行中\nchats-tag-plan = 计划 { $done }/{ $total }\nchats-search = 搜索\nchats-search-placeholder = 搜对话\nchats-primary-empty = 有事随时叫我\nchat-confirm-band = 需要你确认\nchat-sub-primary = 记得你的 { $memories } 件事\nchat-delete = 删除这个对话\nchat-back = 返回\nchat-more = 更多\nchat-placeholder = 说点什么\nskills-search = 搜能力，或直接说你想做什么\nskills-can-do = 小伴会做的事\nskills-quote = “{ $text }”\nskills-try = 试一下 ›\nskills-tray = 试一下 · { $title }\nskills-tray-cancel = 算了\nskills-tray-send = 发给小伴\nskills-scene-life = 生活\nskills-scene-trip = 出行\nskills-scene-cook = 做饭\nskills-scene-docs = 文档与 PPT\nskills-scene-computer = 电脑\nskills-ledger = 记账\nskills-ledger-example = 这个月外卖花了多少\nskills-weather = 天气提醒\nskills-weather-example = 明天要不要带伞\nskills-plan = 排计划\nskills-plan-example = 周五要给客户做汇报，帮我排个计划\nskills-trip = 排行程\nskills-trip-example = 国庆去杭州 3 天，带 6 岁孩子\nskills-trip-change = 旅途中改计划\nskills-trip-change-example = 下雨了，下午换个室内的地方\nskills-tonight = 今晚吃什么\nskills-tonight-example = 冰箱里有鸡蛋番茄，做什么快\nskills-week = 一周菜单\nskills-week-example = 下周工作日都要 20 分钟内的\nskills-cook = 做饭模式\nskills-cook-example = 一步一步带我做照烧鸡腿\nskills-slides = 做 PPT\nskills-slides-example = 把这周周报做成 8 页 PPT\nskills-doc = 写文档\nskills-doc-example = 整理一份租房签合同的注意事项\nskills-sheet = 做表格\nskills-sheet-example = 把这几家航班列个表，按价格排序\nskills-operate = 操作电脑\nskills-operate-example = 把桌面上的发票按月份归档\nskills-code = 改代码\nskills-code-example = 博客登录页一直报 401，帮我查查\nme-you = 你\nme-days = 小伴已陪你 { $days } 天\nme-memories = 它记得的你\nme-memories-count = 全部 { $count } 条\nme-memories-hint = 点任意一条可以删掉；聊天里说「忘掉这个」也行\nme-forget = 忘掉这条\nme-autonomy = 它能自己做主的事\nme-autonomy-current = 现在这档\nme-connected = 已连接\nme-computer = 电脑\nme-computer-online = 已连上 · 局域网\nme-unpair = 解除和这台电脑的配对\nme-unpair-title = 解除配对？\nme-unpair-body = 手机上不会再收到这台电脑的消息，要再用需要重新配对。电脑上的聊天和记忆不受影响。\nprompt-capability-policy = 遇到做不到的事（连不上某个服务、文件格式不支持、某个应用操作反复失败），放弃之前先调用 find_capability 找扩展。从结果里最多给用户 3 个选项，说清楚是谁发布的、有没有认证、需要什么，同时也给一个不用安装的替代办法。只有用户在应用里点卡片才会安装；绝不说你已经安装或开启了什么。\ntool-find-capability-description = 在 MCP 注册表和技能市场里找能补上缺失能力的扩展（连某个服务、处理某种文件、操作某个应用）。只返回候选，绝不安装。最多给用户看 3 个，让用户自己决定；应用会把它们显示成安装卡片。\ntool-find-capability-query = 描述缺失能力的几个英文关键词，例如 "notion"、"pdf forms"、"github issues"\ntool-skill-read-description = 读取一个已安装技能的完整说明。按「已安装技能」里的某个技能做事之前先调用它。\ntool-skill-read-name = 技能名，和列表里写的一样\ncapability-found-note = 这些只是候选，什么都没安装。最多展示 3 个，写明发布者、是否认证、需要什么，并给一个不用安装的办法。用户在应用里点卡片才会安装。\ncapability-found-none = 没找到合适的扩展。给一个不用扩展的办法。\ncapability-skills-label = 已安装技能（按某个技能做事前，先用 skill_read 读它的完整说明）\ncapability-need-input = 需要填写 { $key }：{ $description }\ncapability-need-secret = 需要密钥 { $key }，保存在系统钥匙串：{ $description }\ncapability-need-remote = 会连接 { $host }\ncapability-need-local = 会用 { $runtime } 在这台电脑上运行 { $package }\ncapability-need-unverified = 发布者未认证，只在你信任来源时安装\ncapability-need-skill = 添加一份说明，小伴在需要时读取；它自己不会运行代码\ncapability-error-not-found = 这个扩展已不在搜索结果里，请重新搜索\ncapability-error-risk = 这会在你的电脑上运行未认证发布者的代码，确认风险后才能安装\ncapability-error-missing = 请填写：{ $keys }\ncapability-error-sign-in = 这个服务需要登录账号，小伴暂不支持\ncapability-error-rejected = 服务拒绝了这个密钥，请检查后重试\ncapability-error-runtime = 这台电脑上没有找到 { $runtime }，请先安装 Node.js（提供 npx）或 uv（提供 uvx）\ncapability-error-connect = 连不上这个扩展：{ $detail }\ncapability-error-search = 现在搜索不了扩展\ncapability-error-skill = 从这个地址读不到 SKILL.md\ncapability-error-unsupported = 小伴装不了这个扩展\ncapability-error-keychain = 无法把密钥保存到系统钥匙串\ncapability-error-disabled = 这个扩展已关闭，请让用户在设置里打开\nlife-delete = 删掉\nfridge-stale-phone = 照片是 { $days } 天前的，有些可能吃掉了。长按删掉没有的，或者重拍一张。\nfridge-hint-phone = 长按一样：改数量、用完了；左滑一样：直接删\nkitchen-fridge-empty-phone = 在下面说说冰箱里有什么，比如「有鸡蛋、番茄、两个土豆」。\nkitchen-suggested-phone = 按冰箱推荐 · 都在 { $minutes } 分钟内\nkitchen-uses-count = 用冰箱里 { $count } 样\nkitchen-no-buy = 不用买\nkitchen-pick-missing = 缺 { $items }，记得买\nkitchen-pick-ready = 材料齐了，直接开做\nkitchen-cart = 加入买菜清单\nkitchen-carted = 已加入清单\nkitchen-cook-go = 开始做\nkitchen-empty-body-phone = 在下面说说冰箱里有什么，小伴按几个人吃、忌口和时间推荐三道菜。\nkitchen-shopping-empty-phone = 买菜清单是空的。选好菜后点「加入买菜清单」，或者在下面说「记一下买牛奶」。\ncook-count = { $n } / { $total }\ncook-prev-step = 上一步\ncook-next-step = 下一步\nweek-tab-menu = 菜单\nweek-tab-shopping = 买菜清单 · { $count }\nweek-swap-short = 换\nweek-gone-hint = 「冰箱有」的一行左滑：没了，要买\nweek-chat-placeholder = 比如：周三要加班，那天换成快手菜\nledger-budget-none-phone = 设个预算\nledger-row-when = { $day } { $time }\nledger-app-alipay-name = 支付宝\nledger-app-wechat-name = 微信\nledger-import-title-phone = 导入账单 · { $app } { $count } 笔\nledger-empty-say-phone = 在下面说「午饭 38」「打车 25」就记一笔；导入支付宝、微信账单在电脑上做。\nledger-flow-hint-phone = 左滑一笔可以删，点开可以改\nweather-air-tag = 空气 { $level } { $value }\nweather-sunset = 日落 { $time }\nweather-hours-swipe = 左右滑\nweather-hour-short = { $hour }时\nweather-rules-link = 提醒\nweather-add-short = ＋\nsetup-recommended = { $provider } · 推荐\nsetup-more = 更多\nsetup-key-local = 密钥只存在这台手机里 · 已有电脑端？连上后密钥会自动带过来\nscan-title = 扫码连接电脑\nscan-hint = 对准电脑上「小伴 › 设置 › 设备」里的二维码\nscan-manual = 手动输入地址和配对码\nscan-torch = 手电筒\nscan-found = 找到了：{ $name }\nscan-found-unnamed = 找到了你的电脑\nscan-connecting = 正在连接…\nscan-found-note = 在家时用的是电脑上的会话和记忆；模型密钥也会带到手机上，不在家时手机自己也能聊天。\nscan-retry = 重新扫\nscan-denied-title = 需要相机权限才能扫码\nscan-denied-body = 只用来扫二维码，不拍照也不保存画面。\nscan-open-settings = 去设置里打开\npair-scan = 扫码连接\npair-scan-lead = 在电脑上打开小伴 › 设置 › 设备，用手机扫一下屏幕上的二维码。\npair-or-manual = 扫不了？手动输入\nsetup-scan = 扫电脑上的码\nme-connect-computer = 连接家里的电脑\noperate-working = 小伴在操作 · 第 { $n } 步\noperate-press = 点「{ $label }」\noperate-fill = 填「{ $label }」\noperate-paused-title = 你碰了屏幕，小伴先停下\noperate-paused-detail = 你在操作 · 做到第 { $n } 步\noperate-resume = 让它继续\noperate-end = 结束\noperate-pause = 暂停\noperate-stop = 停止\noperate-handover-title = 到付款这一步了，交给你\noperate-handover-body = 检查没问题就点「{ $label }」，付款由你来。\noperate-handover-ok = 好，我来付\noperate-handover-back = 回到小伴\nconsent-title = 让小伴帮你操作这台手机\nconsent-lead = 需要开启一项系统权限：无障碍服务（顶部悬浮条也靠它显示，不用另开悬浮窗）。开之前，先说清楚。\nconsent-close = 关闭\nconsent-bullet = · { $text }\nconsent-use-title = 用来做什么\nconsent-use-lead = 只在你交代任务时，替你点按别的应用。比如：\nconsent-use-1 = 在外卖应用里点好午饭，停在付款页交给你\nconsent-use-2 = 在买菜应用里按清单加购物车（付款你来）\nconsent-see-title = 它能看到 / 看不到什么\nconsent-can = 能看到\nconsent-can-body = 任务进行时，当前应用屏幕上的文字和按钮\nconsent-cannot = 看不到 / 不碰\nconsent-cannot-body = 密码框、验证码、支付页、银行应用、聊天记录、相册\nconsent-see-note = 没有任务时它不读屏幕；不录屏、不截图，每一步点了什么、填了什么都记在聊天和操作记录里。\nconsent-off-title = 随时怎么关\nconsent-off-1 = 操作时碰一下屏幕，它立刻停\nconsent-off-2 = 系统设置 › 无障碍 › 小伴辅助服务 › 关闭\nconsent-agree = 我已了解上面三点，同意小伴在我交代任务时使用这项权限\nconsent-open = 去系统设置开启\nconsent-later = 先不开，以后再说\nprompt-phone = 你现在运行在用户的安卓手机上，不是电脑。工具说明里的「这台电脑」「软件」都指这台手机和手机上的应用。用户提到美团、淘宝、饿了么这类应用时，先用 find_apps 找到它，再用 look_at_app、click、type_text 替用户在手机上操作（会自动打开应用）；付款、提交订单那一步会自动停下交给用户，你不要去点。手机上只有返回、主页、回车三个按键可用。\n',
  en: 'app-name = Xiaoban\nhub-default-name = Xiaoban\n\nprompt-system = You are Xiaoban, a friendly companion who helps the user with everyday life. Keep answers short and concrete, and reply in English.\nprompt-memory-heading = What you already remember about the user (they may change it at any time):\nmemory-recall-label = Memories that may be relevant\nprompt-memory-galaxies = Other memories are grouped in these galaxies; use recall to open one or search; the most relevant ones come attached to each message:\nprompt-memory-policy = When the user shares something worth keeping (what to call them, family, where they live and work, lasting preferences, allergies and taboos, important dates, dated plans), call remember and then reply naturally. Put it in the right galaxy (a person or a thing; reuse existing names; the user\'s own name, home, work and birthday go in "me"), set its kind and importance, and write the words and situations that may later point to it; allergies and taboos are constraints, things relevant to almost every chat are pinned, dated things get an expiry, and replacements name the old subject in replaces. Do not store small talk or guesses. When the attached memories are not enough, use recall to open a galaxy or search. When the user says a memory is wrong: if there is a correct version, rewrite it under the same subject; otherwise forget it. Never store notes like "this was wrong" or "obsolete".\nquote-context-label = The user is quoting\nturn-regenerate = Answer the previous question again, taking a different approach.\nprompt-memory-tidy = You are tidying the user\'s memories. The input is JSON. With a galaxy field, tidy that galaxy: find duplicates of the same thing (merge: keep one id, drop the others), old memories replaced by newer ones (replace: old id, new id), memories whose aliases are missing or outdated (alias_updates: id to its new alias list), memories that clearly belong to another galaxy (moves: id, galaxy name, cluster), then write a summary of this galaxy in under 25 words and its other names (aliases). When task is place, choose a galaxy for every memory (moves), preferring existing names; the user\'s own basics (name, home, work, birthday) go in "me"; do not give a single memory its own galaxy, and only invent a short new name that can hold similar memories when nothing fits, with cluster from the given list. Only change what you are sure about. Use only ids from the input. Output one JSON object with summary, aliases, merge, replace, alias_updates and moves, using empty values when there is nothing. Field formats: summary is a string; aliases is a list of strings; merge is a list of items with keep (string) and drop (list of strings); replace is a list of items with old and new; alias_updates is a list of items with id and aliases (list of strings); moves is a list of items with id, galaxy and cluster. Use empty lists or strings when there is nothing. When task is review, the input lists every galaxy (name, cluster, count, summary): merge galaxies about the same person or thing, fold tiny galaxies with one or two memories into where they belong (the user\'s own basics into "me"), rename unclear names, and fix wrong clusters. Output a JSON object whose galaxies field is a list of items with name (current), into (target or new name) and cluster; list only what changes.\nprompt-archive = You are keeping cumulative notes on a very long conversation so you can continue it later. You get the previous notes (maybe empty) and the next part of the conversation (user is the user, assistant is you, tool is tool output). Merge the new part into the notes: what is being worked on, decisions and agreements, key facts (times, places, numbers, names), unfinished items and next steps; drop what is done or overturned. Under 800 words, facts only, nothing invented. Output only the new notes.\nprompt-thinking-pick = Decide how deeply you should think before answering the user message below. Output one word only: none (small talk or a one-line answer), low (simple tasks), high (everyday tasks that need care), max (highly complex tasks: hard problems, long reasoning, complex planning or coding). If unsure, output high.\narchive-previous-label = Previous notes:\narchive-chunk-label = Next part of the conversation:\narchive-summary-label = The earlier part of this conversation is archived; cumulative notes follow (use history_search for details):\narchive-recall-label = Possibly relevant snippets from the archived conversation\nprompt-thread-title = Give this conversation a short title of at most 6 words saying what it is about, no quotes or trailing punctuation. Output only the title.\nprompt-interpret-answer = You are helping the user with first-time setup. The app asked them a question; you get the question, the subject to remember, the last thing you said (followUp, which may be a follow-up or a guess based on their location), whether locating is possible (canLocate) and their answer. Decide which case applies. One: they answered, or confirmed your guess, so rewrite what to remember as a short, clean value (for example "just call me Zhe" becomes "Zhe"), keeping only what they actually said or confirmed. Two: they would rather not answer, want to skip or leave it for later, or agreed to your offer to skip; treat it as skipped and do not push. Three: canLocate is true and they ask you to guess, look it up or use their location; request locating. Four: the answer is off-topic, unreadable, random typing or an obvious joke; write one short, friendly line asking them to answer again. Output only a JSON object with four fields: value (what to remember in case one, otherwise null), skip (true in case two, otherwise false), locate (true in case three, otherwise false) and reply (your line in case four, otherwise null).\ntool-remember-description = Remember a lasting fact about the user. Calling it again with the same subject replaces the old value.\ntool-remember-subject = Short subject, such as "name", "kids" or "allergies"\ntool-remember-value = What to remember, as one clear sentence\ntool-remember-category = Category: family, food, home_work (home and work), likes, plans or other\ntool-forget-description = Delete a memory. Only when the user asks to forget it, or says it was wrong and there is nothing correct to replace it with\ntool-forget-subject = Subject of the memory to delete\ntool-remember-galaxy = Which person or thing this belongs to (its galaxy), such as "son", "renovation", "Hangzhou trip", "work". Reuse an existing name when there is one\ntool-remember-kind = Kind: fact; preference; constraint (allergies, taboos, things that must not happen; must come back whenever something related comes up); plan (something scheduled)\ntool-remember-importance = Importance: 3 for health, safety, money or family; 2 normal; 1 passing detail\ntool-remember-aliases = Words and situations that may later point to this: family nicknames, synonyms, scenes where it matters (an allergy: kid, nuts, ordering food, takeout, cooking). Write what is genuinely useful; you decide how many, don\'t pad\ntool-remember-pinned = Whether to keep it always at hand: true for things relevant to almost every chat (name, family, allergies)\ntool-remember-expires = Expiry date YYYY-MM-DD for time-bound things ("working late next Wednesday"); it stops coming up afterwards\ntool-remember-replaces = If this replaces an older memory (a new address after moving), the old memory\'s subject\nprompt-tool-policy = For questions that need live information, such as weather, getting around or trip planning, call a tool first and answer from what it returns. Never make up numbers; if a lookup fails, say so. When planning a trip, check the weather first, search the web for tickets or opening hours when needed, then save it with save_trip.\nnow-context-label = Now\ntool-weather-description = Look up current weather and the forecast for the next few days at a place (high and low temperature, conditions, chance of rain).\ntool-weather-place = Place name: a city, district or landmark, such as "Hangzhou"\ntool-weather-days = How many days ahead, 1 to 16, default 7\nservice-resume-search = Web search is connected now. Carry on and look up what you needed.\nservice-declined-search = Skip web search for now. Carry on with what you know and say prices, opening hours and similar details are unverified.\ntool-web-search-description = Search the web for current information such as tickets, opening hours, events or guides. Returns page titles, links and summaries. Use read_page when you need the details.\ntool-web-search-query = What to search for; be specific\ntool-read-page-description = Read the main text of a web page as Markdown. Use it to confirm details such as tickets and opening hours, preferring official sites.\ntool-read-page-url = Page link, http or https\ntool-locate-description = Find the city and district the user is in right now. Only call it when the user says "nearby", "here" or "from here"; otherwise use the home you remember.\ntool-find-apps-description = Look up installed apps on this computer by name; returns app names and ids. Use it when the user wants to use an app or asks whether one is installed. Search by app name or its English name; you can give several likely names separated by spaces, such as "WeChat 微信" or "Photoshop Pixelmator".\ntool-find-apps-query = App name keywords, several likely names separated by spaces\ntool-open-app-description = Open an app on this computer. The id must come from find_apps.\ntool-open-app-id = App id returned by find_apps\ntool-open-app-name = App name, shown to the user\ntool-look-at-app-description = See the buttons, fields and menus in an app\'s current window as a numbered list. Look once before you start; after that click, type_text, press_keys and do_steps return the new screen in a screen field, so you rarely need to look again. app must be an id from find_apps.\ntool-operate-app = App id from find_apps\ntool-operate-app-name = App name, shown to the user\ntool-operate-element = Number from the look_at_app list\ntool-operate-label = The element\'s name, shown to the user, such as "Export PDF"\ntool-click-description = Click the button, menu item or option with this number from look_at_app. Returns the new screen.\ntool-type-text-description = Fill the field with this number, replacing what is there. Never type passwords, verification codes or card numbers. Returns the new screen.\ntool-type-text-text = Text to fill in\ntool-press-keys-description = Press a shortcut or key in the app, such as cmd+s, cmd+shift+e, return, tab or esc. Returns the new screen.\ntool-press-keys-keys = Key combination joined with +\ntool-recall-description = Recall: open a galaxy to see all its memories, or search all memories by keywords. Use it when the attached memories are not enough or you need to check details\ntool-recall-galaxy = Galaxy name from the memory directory\ntool-recall-query = What to look for\ntool-history-search-description = Helper: rough keyword filter over the archive (misses rephrasings); prefer history_outline\ntool-history-query = What to look for, in words likely used back then\ntool-history-read-description = Read the archived conversation around a position\ntool-history-at = Position from history_search\ntool-list-threads-description = List conversations: the user\'s other conversations by latest update (id, title, date, message count, first line), 30 per page. Use this first when looking for something discussed before; judge from titles and first lines, then read_thread\ntool-page = Page number, from 0\ntool-read-thread-page = Page: 0 is the newest, larger is earlier\ntool-history-outline-description = Archive outline: sections of 20 archived messages with their first line and time. For older details, read the outline, judge yourself, then history_read that section\ntool-find-threads-description = Helper: rough keyword filter over other conversations (misses rephrasings); useful to narrow many; prefer list_threads\ntool-find-threads-query = What to look for\ntool-read-thread-description = Read another conversation: page 0 is the newest part plus its notes; higher pages go further back\ntool-read-thread-id = Conversation id from find_threads\nthread-reference-label = The user referenced the conversation "{ $title }"; its notes and recent turns follow\ntool-open-subthreads-description = Open subthreads: split a large job into parts that can each be done independently and take a while; each gets a lasting subthread that reports back here when done. Asks the user first. Do not use for simple things; subthreads cannot open subthreads\ntool-open-subthreads-reason = One sentence telling the user why and what will happen\ntool-subthread-title = Short subthread title\ntool-subthread-task = Full instructions for this subthread: what to do, how far, what to report\ntool-message-subthread-description = Message one of your subthreads: queued if it is working, otherwise it starts on it\ntool-message-subthread-text = What to say\nsubthread-task-label = A task from the main conversation "{ $title }"\nsubthread-task-rules = Do it fully; your last reply should state the conclusion and key data, which is reported back to the main conversation as is. You cannot open subthreads.\nsubthread-report-label = Report from subthread "{ $title }"\nsubthread-report-rules = This is the result of a subthread you opened. Continue with the others in mind: if all are in, summarize for the user; otherwise give a short progress note and wait for the rest.\ntool-spawn-agents-description = Spawn sub-agents: hand independent parts of a large job to a few one-off sub-agents that run in parallel (they can use your tools) and return all results to you. Only when the job is really large and splitting makes it clearly faster; do simple things, one- or two-step things and dependent steps yourself. Use as few as possible\ntool-agent-title = Short label of what this sub-agent does, shown to the user\ntool-agent-task = Full instructions for this sub-agent: what to find or do and what to return\nagent-task-label = You are a sub-agent responsible only for this: { $title }. When done, return the result and key data concisely.\ntool-file-search-description = Search a large file the user sent for passages about something; returns page numbers and snippets. Large files only come with an outline and the opening, so search first when asked about details, then read those pages with file_read.\ntool-file-read-description = Read pages from to to of a file the user sent (sheets and text files count chunks as pages). Up to about 8000 characters per call; tells you where it stopped.\ntool-file-id = File id from the attachment note in the message\ntool-file-query = What to look for, in words likely to appear in the file\ntool-file-from = First page\ntool-file-to = Last page\nfile-note-full = Attachment { $name } ({ $pages } pages, full text)\nfile-note-on-demand = Attachment { $name } ({ $pages } pages; too long, so only the outline and opening are here; use file_search / file_read with file = { $id } for details)\nfile-note-image = Attached image { $name }\nfile-note-unreadable = Attachment { $name } (no text could be read from it)\nfile-note-outline = Outline\nfile-note-preview = Opening\ntool-do-steps-description = Do several steps in one go; much faster than clicking one by one, so prefer it whenever steps can be chained. Each step is click (an element number), type (fill an element), keys (a shortcut) or text (type a string straight into the app, such as 12+34= in a calculator). Only group steps on the same screen; end the batch at a step that opens a new window or menu, then continue from the new screen. Stops at the first failing step and says which one; returns the new screen.\ntool-do-steps-summary = What this group of steps does, shown to the user, such as "Type 12+34="\ntool-do-steps-steps = Steps to do in order\ntool-confirm-description = Before doing something with consequences for the user (messaging someone, submitting a form, deleting, paying, overwriting a file), call this to get their go-ahead. Returns yes, edit or no; act on the answer.\ntool-confirm-title = One-line question, such as "Send this to your wife?"\ntool-confirm-detail = What exactly will be sent or changed, a line or two\ntool-save-trip-description = Save a planned trip. The app shows it as a trip card with details and links to Amap navigation. It fills in each day\'s weather and replaces your travel estimates with measured routes when it can. Call it whenever you finish or change a plan; keep your reply short and do not list the itinerary again.\ntool-save-trip-title = Title, such as "Hangzhou · 3 days"\ntool-save-trip-city = Destination city, such as "Hangzhou"\ntool-save-trip-party = Who is going, such as "2 adults, 1 child (6)"\ntool-save-trip-needs = Anything to take care of, such as "no peanuts"; leave out if none\ntool-save-trip-reminder = One reminder for the user, such as a weather change or somewhere to arrive early\ntool-save-trip-cost = Estimated cost from public prices, such as "about ¥4,800 · train, hotel, tickets"\ntool-save-trip-update = true when changing the trip already in this conversation\ntool-save-trip-day-date = Date, formatted 2026-11-14\ntool-save-trip-day-change = One sentence on what you changed for this day, such as because of weather; leave out if nothing\ntool-save-trip-stop-name = Place name that can be found on Amap, such as "China National Tea Museum"\ntool-save-trip-stop-time = Arrival time, such as "09:00"\ntool-save-trip-stop-note = One short note, such as "quiet in the morning, easy with a stroller"\ntool-save-trip-stop-detail = Place details. Required for sights, restaurants and malls, written from what you found online; leave out for stations, airports and hotels\ntool-save-trip-next-mode = How to get to the next stop: walk, taxi or transit\ntool-save-trip-next-minutes = Roughly how many minutes to the next stop, from your own estimate\ntool-save-trip-detail-why = Why it is worth going, two or three concrete highlights (best spot, best time, seasonal sights). Write all detail text as plain text, without Markdown bold, headings or lists\ntool-save-trip-detail-suits = Two to four short tags on who it suits, such as "stroller friendly" or "no climbing"\ntool-save-trip-detail-duration = How long to stay, such as "1.5–2 hours"\ntool-save-trip-detail-quiet = When it is quiet, such as "weekdays before 10am"\ntool-save-trip-detail-tickets = Tickets and opening hours in a line or two; only what you found online\ntool-save-trip-detail-reviews = Up to three real quotes from travel notes or reviews, each with its source; leave out without web search\ntool-save-trip-review-text = The quote, kept short\ntool-save-trip-source-title = Source name, such as the official site or a travel site\ntool-save-trip-source-url = Source page link\ntool-save-trip-source-date = When the source was published, such as "2026-09"\ntool-save-place-detail-description = Fill in or update the place details for one stop of the trip, leaving everything else unchanged. Use it when the user asks you to look up a place; do not rewrite the whole trip with save_trip. Look things up online first; after saving, reply with one short sentence and do not repeat the details.\ntool-save-place-detail-day = Which day the stop is on, starting at 1\ntool-save-place-detail-stop = The stop name as written in the trip\n\nnav-main = Main navigation\ndevice-desktop = This computer\ndevice-ios = iPhone\ndevice-android = Android phone\n\nconnection-idle = Not connected\nconnection-connecting = Connecting\nconnection-open = Connected\nconnection-reconnecting = Reconnecting\nconnection-closed = Disconnected\nconnection-waiting-for-hub = Connecting to your home computer…\n\nhome-greeting = All set. Just tell me whenever you need something; once your phone is connected we can keep chatting there too.\nhome-greeting-named = { $name }, all set. Just tell me whenever you need something; once your phone is connected we can keep chatting there too.\nhome-greeting-suggest = Not sure where to start? Try one of these:\nthread-new-shortcut = New conversation (⌘N)\nthread-ref-title = Referencing · { $title }\nthread-ref-hint = Xiaoban reads its notes and latest turns\nthread-ref-remove = Remove this conversation\nthread-ref-pick = Type @ to pick a conversation\nthread-status-running = Working\nthread-status-done = Done\nthread-status-need = Needs you\nthread-new = New conversation\nthread-empty = No conversations yet\nthread-untitled = New conversation\n\ncomposer-label = Message Xiaoban\ncomposer-placeholder = Tell Xiaoban what you need\ncomposer-send = Send\ncomposer-queued = Next up\ncomposer-cancel-words = never mind|cancel|stop|forget it\ncomposer-placeholder-busy = Enter queues it next · say "never mind" to stop\ncomposer-stop = Stop\n\nreasoning-thinking = Thinking for { $seconds }s\nreasoning-thought = Thought for { $seconds }s\nreasoning-show = Show thinking ›\nreasoning-hide = Hide thinking\ndraft-long-wait = { $seconds }s so far; this one takes a while\ndraft-background = Run in background, tell me when done\ndraft-background-running = Running in background\ndraft-background-untitled = Background task\ndraft-thinking = Thinking…\ndraft-elapsed = Thought for { $seconds } s\ndraft-failed = Didn’t work: { $reason }\n\nfailure-model = The model ran into a problem\nfailure-not-configured = No model is connected yet\nfailure-network = The network dropped\nfailure-cancelled = Stopped\nfailure-budget = Spending limit reached\nfailure-internal = Something went wrong inside Xiaoban\n\nerror-unsupported-protocol = Xiaoban versions don’t match. Update both devices.\nerror-unauthorized = The pairing code is wrong or has expired\nerror-bad-request = Invalid request\nerror-not-found = Not found\nerror-busy = Still replying to the previous message\nerror-internal = Something went wrong inside Xiaoban\nerror-unreachable = Can’t reach your computer. Check that both are on the same Wi-Fi.\n\npair-title = Connect your home computer\npair-lead = On your computer, open Xiaoban › Settings › Devices and enter the address and pairing code shown there.\npair-address-placeholder = Computer address, e.g. 192.168.1.8\npair-code-placeholder = 6-digit pairing code\npair-submit = Connect\npair-submitting = Connecting…\n\nprovider-deepseek = DeepSeek\nprovider-mimo = Xiaomi MiMo\nprovider-custom = Custom / relay\nmodel-not-connected = No model connected\nmodel-current = Current model\n\nonboarding-hello = Hi, I’m Xiaoban\nonboarding-local-first = I run on your own devices. No account needed, and your chats and memories stay at home.\nonboarding-pick-provider = First, connect me to a model:\nonboarding-recommended = Recommended\nonboarding-key-label = API key\nonboarding-key-placeholder = Paste your { $provider } key\nonboarding-show-key = Show key\nonboarding-hide-key = Hide key\nonboarding-get-key = No key yet? Get one from { $provider }\nonboarding-cost-note = Everyday chatting costs a few yuan a month, billed to your own key.\nonboarding-submit = Test and continue\nonboarding-checking = Testing…\nonboarding-key-local = Your key stays in this computer’s keychain\nfailure-invalid-key = That key didn’t work. Check that you copied all of it.\nfailure-unknown-model = That endpoint doesn’t serve this model. Check the model name.\nfailure-invalid-endpoint = The endpoint must start with http:// or https://\ncustom-description = Any OpenAI-compatible endpoint works, such as a relay or a local Ollama\ncustom-api-label = API format\ncustom-api-open_ai = OpenAI-compatible\ncustom-api-responses = OpenAI Responses\ncustom-api-responses-hint = Uses /responses — OpenAI\'s newer API; some GPT models and plans only offer this\ncustom-api-anthropic = Anthropic\ncustom-api-open_ai-hint = Uses /chat/completions — most relays, DeepSeek, Qwen, Kimi, Ollama and others\ncustom-api-anthropic-hint = Uses /v1/messages — Claude\'s own API or Anthropic-format relays\ncustom-base-url-label = Endpoint\ncustom-base-url-placeholder = https://your-relay/v1\ncustom-model-label = Model\ncustom-model-placeholder = e.g. deepseek-v4-flash\ncustom-label-label = Name (optional)\ncustom-label-placeholder = e.g. My relay\ncustom-trust-warning = Your key will be sent to this address. Make sure you trust it.\n\nonboarding-intro = Two minutes of setup, then just chat with me.\nonboarding-privacy = No account needed. Your data stays on your devices.\nonboarding-progress = Step { $step } of { $total }\nonboarding-back = Back\nonboarding-skip = Skip\nonboarding-later = Later\nonboarding-next = Next\nonboarding-finish = Finish and start\nstep-model-title = Connect a model\nstep-model-hint = With your own key\nstep-meet-title = Get to know you\nstep-meet-hint = A few quick questions\nstep-trust-title = How much to hand off\nstep-trust-hint = What I may do on my own\nstep-phone-title = Connect your phone\nstep-phone-hint = You can do this later\nmodel-heading = First, connect me to a model\nmodel-lead = Xiaoban doesn’t ship a model. Pick a provider, or enter your own relay.\ncustom-card-hint = OpenAI-compatible\ncustom-base-url-hint = Pasting the full /chat/completions URL works too; it gets trimmed\nfailure-unknown-model-listed = This endpoint doesn’t serve { $model }. Check the model name. It lists: { $models }\nmeet-heading = Let Xiaoban get to know you\nmeet-lead = Answer a few questions and I’ll remember what’s useful. You can edit or delete anything later under Me › Memories.\nmeet-question-preferred-name = What should I call you?\nmeet-question-home-and-work = Which city do you live in, and where do you work?\nmeet-question-household = Is there anyone at home I should help look after?\nmeet-reply-alone = Just me\nmeet-reply-pass = Skip this one\nmeet-input-placeholder = Type your answer and press Enter\nmeet-remembered = Remembered · { $topic }: { $value }\nmeet-intro = I’ll ask three quick questions. Answer only what you like; you can change anything later.\nmeet-unclear = I didn’t quite get that. Could you say it another way?\nmeet-failed = { $reason }. Nothing was saved yet; you can send it again.\nmeet-progress = Question { $current } of { $total }\nmeet-reading = Xiaoban is reading your answer\nmeet-locating = Let me see where you are\nmeet-location-guess = Looks like you’re in { $place } right now. Do you live around here? And where do you work?\nmeet-location-note = Location was used just this once; no coordinates were saved\nmeet-location-missing = No location, no problem. Just tell me which city you’re in, and where you work if you like.\nmeet-reply-guess-right = Yes, I live here\nmeet-reply-guess-wrong = No\nlocation-place = { $district }, { $city }\nmeet-all-set = Got it all. Let’s keep going.\nmemory-topic-preferred-name = Name\nmemory-topic-home-and-work = City and work\nmemory-topic-household = Household\ntrust-heading = How much should I do on my own?\ntrust-lead = Pick one for now. You can adjust it per task or plan later.\ntrust-cautious-name = Cautious\ntrust-cautious-desc = Ask before doing anything.\ntrust-cautious-example = Even reminders get a quick check first.\ntrust-balanced-name = Balanced (recommended)\ntrust-balanced-desc = Look things up, set reminders and log expenses on my own; ask before spending or speaking for you.\ntrust-balanced-example = Reminders are set directly; food orders show a confirmation.\ntrust-hands-off-name = Hands-off\ntrust-hands-off-desc = Handle small recurring payments too and tell you afterwards. Everything can be undone.\ntrust-hands-off-example = Pay the electricity bill when due and log it in Daily.\ntrust-red-lines = Paying, signing contracts and contacting new people always pause for your approval, whatever you pick.\nphone-heading = Connect your phone too\nphone-lead = With your phone connected you can check reminders and approve things on the go. Everything syncs over your local network, never through a server.\nphone-step-install = 1. Install Xiaoban on your phone (iPhone or Android)\nphone-step-scan = 2. Scan this code, or enter the two values below\nphone-step-wifi = 3. Keep the phone and this computer on the same Wi-Fi\nphone-qr-label = Pairing QR code\nphone-address-label = Computer address\nphone-code-label = Pairing code · expires in { $time }\nphone-code-expired = Pairing code expired\nphone-refresh = New pairing code\nphone-waiting = Waiting for your phone…\nphone-connected = { $name } is connected\nphone-no-network = No local network address found. Check this computer’s Wi-Fi.\nphone-relay-hint = Want to use it away from home? Add a self-hosted relay in Settings.\npair-hello = Connect your home computer\npair-home-lead = I live on your home computer. Open Xiaoban there, then enter the address and pairing code it shows.\n\napp-mark = X\nnav-chat = Chats\nnav-daily = Today\nnav-skills = Skills\nnav-me = Me\nnav-soon = Coming soon\nsearch-label = Search\nsearch-placeholder = Search chats, memories, files\nthread-list-hint = Each new job will get its own conversation here.\ntime-just-now = Just now\ntime-yesterday = Yesterday\nchat-subtitle-primary = Everyday chat · { $model }\nhome-suggestion-umbrella = Remind me to take an umbrella tomorrow morning\nhome-suggestion-expense = Log an expense: lunch, 38 yuan\nhome-suggestion-weekend = Where can we take the kids this weekend?\nworkspace-label = Workspace\nworkspace-memories = What Xiaoban remembers\nworkspace-memories-empty = Nothing yet. It fills up as you chat.\nmemory-sky-count = { $count }\nmemory-sky-loose = Unsorted\nmemory-sky-crumb-separator = ›\nmemory-sky-all = All\nmemory-sky-crumbs = Where you are in the sky\nmemory-sky-label = Memory sky, { $count } memories\nmemory-sky-summary = { $count } · { $pinned } kept at hand\nmemory-sky-expand = Expand ⤢\nmemory-sky-title = Memory sky\nmemory-sky-search = Search memories\nmemory-sky-search-placeholder = Search memories, e.g. allergy\nmemory-sky-hint = Drag to rotate · scroll to zoom · click a cluster or galaxy to fly in · double-click a star · Esc to close\nmemory-card-constraint = constraint\nmemory-card-pinned = kept at hand\nmemory-card-meta = Used { $uses } times · remembered { $date }\nmemory-card-aliases = Also: { $aliases }\nmemory-card-separator = ,{" "}\nmemory-card-pin = Keep at hand\nmemory-card-unpin = Stop keeping at hand\nmemory-card-edit = Edit\nmemory-card-edit-prompt = Change the memory "{ $subject }" to:{" "}\nmemory-card-forget = Forget\nmemory-graph-count = { $count }\nmemory-graph-glowing = { $count } glowing\nmemory-graph-used-title = Memories used this time\nmemory-graph-few = Chat a bit more and this will slowly light up\nmemory-graph-recent = Recently remembered\nmemory-graph-legend = { $count } { $category }\nmemory-graph-tip = { $category } · used { $uses } times · remembered { $date }\nmemory-category-family = family\nmemory-category-food = food\nmemory-category-home_work = home and work\nmemory-category-likes = likes\nmemory-category-plans = plans\nmemory-category-other = other\nworkspace-memories-hint = Change anything under Me › Memories\nworkspace-memory = { $subject }: { $value }\nworkspace-phone = Phone\nworkspace-phone-none = No phone connected yet\nworkspace-phone-none-hint = Connect it to reach Xiaoban when you are out\nworkspace-phone-connect = Connect\nworkspace-phone-connected = Connected\npairing-dialog-title = Connect your phone\ndialog-close = Close\nvoice-shortcut = ⌥ Space\nvoice-start = Voice input · hold { $shortcut }\nvoice-listening = Listening\nvoice-hint = Release { $shortcut } or press Done when finished. The text stays in the box so you can edit before sending\nvoice-cancel = Cancel\nvoice-done = Done\nvoice-denied-microphone = Xiaoban needs microphone access before you can talk to it\nvoice-denied-speech = Xiaoban needs speech recognition access before you can talk to it\nvoice-unavailable = Speech recognition is not available on this computer right now; type instead\nvoice-open-settings = Open System Settings\nvoice-cancel-key = Esc\nrich-footnotes = Footnotes\nrich-footnote-back = Back to text\nrich-image-failed = Image can\'t be loaded\nrich-image-open = Open link\nrich-image-copy-link = Copy link\nviewer-open = View { $name } larger\nviewer-close = Close\nviewer-previous = Previous\nviewer-next = Next\nviewer-copy = Copy\nviewer-save = Save to Downloads\nviewer-preview = Open in Preview\nviewer-open-page = Open page · { $site }\nviewer-copied = Copied\nviewer-saved = Saved to Downloads\nviewer-failed = That didn\'t work, try again\nrich-copy = Copy\nrich-copied = Copied\ntool-name-remember = memory\ntool-name-weather = Weather\ntool-name-search = Search\ntool-name-trip = Routes\ntool-name-detail = Details\ntool-name-page = Web page\ntrace-joiner = { " · " }\ntrace-summary = Used { $names } ({ $count ->\n    [one] 1 step\n   *[other] { $count } steps\n})\nmemory-saved-chip = Remembered · { $subject }: { $value }\ndraft-stopped = Stopped · tap to answer again\ndraft-unreachable = Couldn’t connect, tap to retry\ndraft-failed-retry = { $reason }, tap to retry\ndelivered = Delivered\nreply-meta = { $time } · took { $seconds }s\nreply-time = { $time }\nmenu-copy = Copy\nmenu-cut = Cut\nmenu-paste = Paste\nmenu-select-all = Select All\nmenu-voice = Voice Input\nmenu-quote = Quote in Reply\nmenu-quote-selection = Quote This Part\nmenu-new-thread-with = New Conversation with This\nmenu-look-up = Look It Up\nmenu-read-aloud = Read Aloud\nmenu-stop-reading = Stop Reading\nmenu-regenerate = Answer Again\nmenu-regenerate-last-only = Latest only\nmenu-open = Open\nmenu-rename = Rename\nmenu-mark-unread = Mark as Unread\nmenu-delete-thread = Delete Conversation…\nquote-label = Quote\nquote-from-assistant = Xiaoban\nquote-from-user = You\nquote-image = [image]\nquote-table = [table]\nquote-expand = Show the whole quote\nquote-collapse = Collapse the quote\nquote-gone = The original is gone\nattach-add = Add images or files\nattach-remove = Remove { $name }\nattach-too-big = Over 20MB\nattach-too-many = 9 at most\nattach-vision-deepseek = This message has images, so DeepSeek V4 Flash vision will look at it; same key, same price as V4 Flash\nattach-vision-mimo = MiMo V2.5 Pro can\'t see images. Use MiMo V2.5 for this message?\nattach-vision-switch = Use it for this one\nattach-vision-text-only = Send text only\nattach-drop = Drop to give { $count ->\n    [one] 1 file\n   *[other] { $count } files\n} to Xiaoban\nattach-drop-hint = Images, PDF, Word, spreadsheets and text · up to 20MB each\nattach-read-full = { $pages } pages · read\nattach-read-on-demand = { $pages } pages · read as needed\nattach-unreadable = Xiaoban can\'t read this kind of file\nquote-remove = Remove quote\nthread-unread = New messages\ndelete-thread-title = Delete “{ $title }”?\ndelete-thread-body = The chat history of this conversation will be deleted for good. What Xiaoban remembers is not affected.\ndelete-thread-confirm = Delete\ndialog-cancel = Cancel\npanel-list-shortcut = ⌘⌥S\npanel-workspace-shortcut = ⌘⌥I\npanel-list-hide = Hide conversations { $shortcut }\npanel-list-show = Show conversations { $shortcut }\npanel-workspace-hide = Hide workspace { $shortcut }\npanel-workspace-show = Show workspace { $shortcut }\nvoice-dictation-off = Turn on Dictation in System Settings › Keyboard to use voice input\nlook-up-message = Look this up\nversions-previous = Previous version\nversions-next = Next version\nversions-count = { $current } / { $total }\ntrip-range = { $from }–{ $to }\ntrip-day = Day { $n }\ntrip-weekday-0 = Sun\ntrip-weekday-1 = Mon\ntrip-weekday-2 = Tue\ntrip-weekday-3 = Wed\ntrip-weekday-4 = Thu\ntrip-weekday-5 = Fri\ntrip-weekday-6 = Sat\ntrip-month-day = { $month }/{ $day }\ntrip-sky-clear = Clear\ntrip-sky-cloudy = Partly cloudy\ntrip-sky-overcast = Overcast\ntrip-sky-fog = Fog\ntrip-sky-light_rain = Light rain\ntrip-sky-rain = Rain\ntrip-sky-heavy_rain = Heavy rain\ntrip-sky-snow = Snow\ntrip-sky-storm = Thunderstorm\ntrip-weather-range = { $sky } { $low }–{ $high }°\ntrip-weather-rain = { $sky } · { $chance }% chance\ntrip-stops-joiner = { " → " }\ntrip-stops-more = { $stops } and { $count } more\ntrip-open = Open trip\ntrip-revise = Change it\ntrip-updated = Updated\ntrip-view-version = View this version\ntrip-unverified = Tickets and opening hours not checked online\ntrip-connect-search = Connect web search\ntrip-mode-walk = walk\ntrip-mode-taxi = taxi\ntrip-mode-transit = transit\ntrip-leg = { $minutes } min { $mode }\ntrip-leg-estimated = about { $minutes } min · { $mode }\ntrip-back = ‹ Back to { $title }\ntrip-cost = Estimated cost { $cost }\ntrip-sync-calendar = Add to Calendar\ntrip-copy-family = Copy for family\ntrip-reminder = Xiaoban says: { $text }\ntrip-open-amap = Open in Amap\ntrip-nearby-food = Food nearby\ntrip-route = Route\ntrip-say = Tell Xiaoban\ntrip-say-placeholder = Tell Xiaoban, e.g. take it easier on day 2, we need a nap at noon\ntrip-send = Send\ntrip-old-version = This is the version from { $time }\ntrip-back-latest = Back to latest\ntrip-toast-amap = Opening Amap…\ntrip-toast-calendar = Added { $count } events to the “Xiaoban trips” calendar\ntrip-toast-calendar-open = Open Calendar\ntrip-toast-calendar-denied = No calendar access\ntrip-toast-calendar-settings = Open System Settings\ntrip-toast-calendar-failed = Couldn’t add to Calendar. Try again later\ntrip-toast-copied = Copied. Paste it to your family chat\ntrip-copy-stop = { $time } { $name } ({ $note })\ntrip-copy-footer = Planned with Xiaoban\ntrip-amap-food = food near { $place }\ntrip-revise-quote = { $title } · { $range }\ntrip-loading = Loading trip…\ntrip-calendar-name = Xiaoban trips\nplace-close = Close\nplace-photos = Photos and reviews in Amap\nplace-why = Why go\nplace-suits = Good for\nplace-duration = How long\nplace-quiet = Quietest\nplace-tickets = Tickets and hours\nplace-checked = Checked online · { $date }\nplace-checked-old = Checked { $date }\nplace-source = Source: { $title }\nplace-unverified = Not checked online. Confirm in Amap before you go\nplace-reviews = What people say\nplace-review-source = { $title } · { $date }\nplace-replace = Swap this place\nplace-remove = Remove this stop\nplace-empty = No details for this stop yet.\nplace-ask = Ask Xiaoban to look it up\nplace-meta = Day { $day } · { $time }\nplace-ask-message = Look up details for { $name }\nplace-replace-message = Swap { $name } on day { $day } for somewhere else\nplace-remove-message = Remove { $name } from day { $day }\nsearch-card-title = Connect web search\nsearch-card-subtitle = Use DeepSeek search for tickets, opening hours and current events\nsearch-card-step-1 = Sign in to { $platform } and create an API key\nsearch-card-platform = DeepSeek Platform\nsearch-card-step-2 = Paste the key below\nsearch-card-key = DeepSeek API key\nsearch-card-placeholder = Paste key\nsearch-card-save = Save\nsearch-card-verifying = Checking\nsearch-card-keychain = Stored only in this computer’s keychain.\nsearch-card-skip = Not now\nsearch-card-invalid = This key doesn’t work. Check that you copied all of it\nsearch-card-offline = Can’t reach DeepSeek right now. Try again later\nsearch-card-connected = Web search connected\nsearch-card-resuming = Xiaoban is picking up where it left off…\nsearch-card-skipped = Skipped web search this time\nsearch-card-skipped-hint = You can connect it later in Skills\nworkspace-outputs = Outputs\nworkspace-trip = { $range } · { $count } places\nworkspace-open = Open\ntool-name-locate = Location\nplace-review = “{ $text }”\ntrip-card-meta = { $range } · { $party }\ntrip-unverified-lead = { $text } ·{ " " }\ntrip-toast-calendar-handed = Sent { $count } events to your calendar app. Click “Add” there\ntrip-toast-calendar-retry = Didn’t open? Try again\ntrip-context-label = Trip the user is viewing\ntrip-context-body = “{ $title }”, version { $version }. Look things up online first. To fill in one stop’s details call save_place_detail; to change the plan call save_trip with update set to true and the complete new trip, keeping everything the user did not mention unchanged. After saving, reply in a sentence or two; the app shows the result.\nstep-web_search = Search “{ $detail }”\nstep-web_search-plain = Search\nstep-read_page = Read page · { $detail }\nstep-read_page-plain = Read page\nstep-weather = Weather · { $detail }\nstep-weather-plain = Weather\nstep-save_trip = Write it back to the trip\nstep-save_place_detail = Save details · { $detail }\nstep-save_place_detail-plain = Save the details\nstep-remember = Remember · { $detail }\nstep-remember-plain = Remember\nstep-locate = Find location\nstep-generic = Working\nstep-found = { $count } results from { $sources }\nstep-found-plain = { $count } results\nstep-saved = Saved as version { $version }\nstep-failed-page = Couldn’t open it, trying another source\nstep-failed = Didn’t work, trying another way\nstep-sources-joiner = {", "}\nlooking-title = Xiaoban is looking\nlooking-elapsed = { $seconds }s so far\nlooking-stop = Stop\nlooking-slow = Taking longer than usual, a site may be slow. Xiaoban is still on it\nworking-show-steps = Show each step\nstep-thinking = Working out the next step…\nisland-step-count = Step { $n }\nisland-step-line = { $text } · step { $n }\nisland-stop = Stop\nisland-pause = Pause\nisland-resume = Resume\nisland-paused = Paused · tap Resume to continue\nisland-open-main = Open main window\nisland-collapse = Collapse\nisland-note-label = Tell Xiaoban\nisland-note-placeholder = Add a note; Xiaoban reads it at the next step\nisland-hint = Keep using your computer, nothing clashes · only apps you allowed\nisland-title-app = Using { $app } · step { $n }\nisland-title = { $title } · step { $n }\nisland-title-app-background = Using { $app } in the background · step { $n }\nisland-menu-expand = Expand\nisland-menu-home = Put back\nisland-menu-snooze = Hide until something comes up\nisland-menu-settings = Settings…\nisland-menu-quit = Quit Xiaoban\nisland-open = Open Xiaoban\nisland-done = { $title } · all { $count } steps done\nisland-done-reply = { $title } · reply ready\nstep-find_apps = Find apps “{ $detail }”\nstep-find_apps-plain = Find apps\nstep-open_app = Open { $detail }\nstep-open_app-plain = Open an app\nstep-matched = Found { $names }\nstep-matched-none = Nothing found\ntool-name-apps = Apps\nstep-look_at_app = Look at { $detail }\nstep-look_at_app-plain = Look at the app\nstep-click = Click “{ $detail }”\nstep-click-plain = Click\nstep-type_text = Type into “{ $detail }”\nstep-type_text-plain = Type\nstep-press_keys = Press { $detail }\nstep-press_keys-plain = Press keys\nstep-forget = Forget "{ $detail }"\nstep-forget-plain = Forget a memory\nstep-history_search = Search chat history for "{ $detail }"\nstep-history_search-plain = Search chat history\nstep-history_read = Read earlier chat\nstep-find_threads = Find conversations about "{ $detail }"\nstep-find_threads-plain = Find conversations\nstep-read_thread = Read another conversation\nstep-list_threads = List conversations\nstep-history_outline = Read the archive outline\nstep-open_subthreads = Open subthreads\nstep-message_subthread = Message a subthread\nstep-spawn_agents = Spawn sub-agents\nagents-head = { $count } sub-agents · working in parallel\nagents-title = Sub-agent · { $title }\nagents-working = Step { $steps }…\nagents-done = Done · { $steps } steps\nstep-recall = Recall { $detail }\nstep-recall-plain = Recall\nstep-do_steps = { $detail }\nstep-do_steps-plain = Do a few steps\nstep-confirm = Ask you: { $detail }\nstep-confirm-plain = Waiting for you\ntool-name-operate = Use apps\nconfirm-mouse-title = { $app } ignores background actions. Borrow the mouse?\nconfirm-mouse-hint = Xiaoban switches to it, clicks once and gives the mouse and window back in about a second\nconfirm-mouse-no = I\'ll do it\nconfirm-mouse-once = Just this once\nconfirm-mouse-always = Always for this app\nconfirm-subthreads-title = I\'d like to open { $count ->\n    [one] a subthread\n   *[other] { $count } subthreads\n} for this\nconfirm-subthreads-hint = Opening subthreads needs your OK\nconfirm-subthreads-item = · { $title }\nconfirm-subthreads-no = I\'ll do it\nconfirm-subthreads-edit = Change it\nconfirm-subthreads-yes = Go ahead\nsubthread-cards-hint = Subthreads (open for details)\nsubthread-open-arrow = ›\nsubthread-report-title = Subthread report · { $title }\nconfirm-allow-title = Let Xiaoban use “{ $app }”?\nconfirm-allow-hint = First time using this app, so it needs your OK\nconfirm-allow-no = Don’t allow\nconfirm-allow-once = Just this time\nconfirm-allow-always = Always allow\nconfirm-action-hint = This step has consequences, so it needs your OK\nconfirm-action-no = No\nconfirm-action-edit = Change it\nconfirm-action-yes = Go ahead\nconfirm-permissions-title = Xiaoban needs permission to use this computer\nconfirm-permissions-hint = Open Xiaoban and follow the steps\noperate-consent-title = Let Xiaoban use this computer for you\noperate-consent-lead = One permission needs turning on in System Settings. Here is what it is for.\noperate-consent-what = 1 · What it’s for\noperate-consent-what-body = Only when you give it a task: clicking buttons, typing and choosing menus for you, such as exporting a spreadsheet to PDF or filling in a web form (it asks before submitting).\noperate-consent-permissions = 2 · The permission\noperate-consent-control = Accessibility\noperate-consent-control-body = See the buttons and fields in apps, and click and fill them for you. No screen recording, no screenshots.\noperate-consent-limits = 3 · What it won’t touch\noperate-consent-limits-body = Only apps you have allowed; never password fields, verification codes, payment pages or banking apps. Nothing is read when there is no task.\noperate-consent-stop = 4 · Will it get in your way?\noperate-consent-stop-body = It never takes over your mouse or keyboard, so you can keep using the computer. To stop it: Pause or Stop on the island · turn it off in System Settings › Privacy & Security\noperate-consent-later = Not now\noperate-consent-open = Open System Settings\noverlay-click = Click “{ $label }” · step { $n }\noverlay-type = Type into “{ $label }” · step { $n }\noverlay-click-real = Clicking “{ $label }” with the real mouse · step { $n } · back in a moment\noverlay-type-real = Typing into “{ $label }” with the real keyboard · step { $n } · back in a moment\noverlay-unnamed = here\n\nfile-open-hint = Open ↗\nfile-open-label = Open { $name }\nfile-menu-open = Open\nfile-menu-reveal-mac = Show in Finder\nfile-menu-reveal-windows = Show in File Explorer\nfile-menu-copy = Copy File\nfile-menu-save-as = Save As…\nfile-menu-look-again = Ask Xiaoban to Look Again\nfile-look-again = Take another look at this file: { $name }\nimage-menu-zoom = Zoom In\nimage-menu-preview-mac = Open in Preview\nimage-menu-preview-windows = Open in Photos\nimage-menu-copy = Copy Image\nimage-menu-download = Save to Downloads\nmenu-key-space = Space\n\nchat-subtitle-lead = Everyday chat\nthinking-title = Thinking\nthinking-auto = Auto\nthinking-none = none\nthinking-low = low\nthinking-high = high\nthinking-max = max\nthinking-auto-help = (default) Xiaoban picks low / high / max per task, following the official advice; no thinking for small talk\nthinking-none-help = Thinking off, answer directly\nthinking-low-help = Officially recommended for simple tasks\nthinking-high-help = Officially recommended for everyday tasks (the official default)\nthinking-max-help = Officially recommended for highly complex tasks; slower and costlier\nthinking-unsupported = This model cannot adjust its thinking effort\nthinking-model = Model\nmodel-switching = Switching…\nmodel-switch-failed = Couldn\'t switch; try again later\nmodel-add = Add another model…\nreply-thought = Thought for { $seconds }s\nreply-thought-effort = Thought for { $seconds }s · { $effort }\narchive-folded = { $count } earlier messages archived · Xiaoban keeps the key points\narchive-expand = Show ⌄\narchive-above = Archived chat above · Xiaoban reads the key points\narchive-collapse = Hide ⌃\narchive-loading = Loading earlier messages…\narchive-summary = Key points\narchive-summary-title = What Xiaoban remembers\narchive-summary-count = Tidied { $count } times\narchive-summary-empty = No key points yet\narchive-summary-foot = Read-only; to correct something, just tell Xiaoban\ncontext-trigger = Context { $percent }%\ncontext-title = This conversation\'s context\ncontext-amount = { $percent }% · about { $used } / { $window }\ncontext-help = The longer it gets, the slower and costlier each reply. Tidying turns earlier chat into key points for Xiaoban; the full text stays on this computer, where you can scroll and search it, and Xiaoban looks things up when it needs detail.\ncontext-compact = Tidy now\ncontext-compact-note = Earlier chat becomes key points; the last 10 rounds stay as they are\ncontext-compact-short = Not much to tidy yet\ncontext-compacting = Tidying…\ncontext-auto = Tidy automatically at\ncontext-auto-off = Never\ncontext-auto-note = Applies to all conversations\ncontext-compacting-pill = Tidying earlier chat…\ncontext-compacting-hint = Keep talking; replies come once tidying is done\ncontext-compacted = Tidied · context { $from }% → { $to }%\ncontext-compact-failed = Couldn\'t tidy this time; try again later\nthread-menu-compact = Tidy earlier chat\nprompt-workspace = This conversation is in the workspace "{ $name }", folder { $path }. When asked to look at or change code, explore with list_dir, search_files and read_file first, then make small exact edits with edit_file (copy old verbatim from the file with enough context to be unique); use write_file only to create a file or rewrite it whole, and always read a file before changing it. Use run_command for tests, builds and similar, with a clear reason; if the user declines, tell them the command to run themselves and do not retry it in another form. Reading or writing outside the workspace asks the user. After changing things, briefly say what changed and why without pasting the code again. Use git only to look; commit, push or switch branches only when the user asks. Refer to pull requests and issues as #number (e.g. #42); the app shows them as status chips.\ntool-code-path = Path relative to the workspace folder; absolute or ~ paths also work. Leave empty for the workspace root.\ntool-list-dir-description = List files and subfolders (honouring .gitignore); folders end with /.\ntool-list-dir-depth = How many levels to list, 1 to 3, default 1.\ntool-read-file-description = Read a text file and return the requested line range plus the total line count. Up to 2000 lines per call; read long files in parts.\ntool-read-file-from = First line to read, default 1.\ntool-read-file-to = Last line to read (inclusive).\ntool-search-files-description = Search the workspace: by content by default (a regex; an invalid one is treated as plain text), returning file, line number and line; set names to search file names instead.\ntool-search-files-query = Text or part of a file name to find.\ntool-search-files-names = When true, search file names only.\ntool-write-file-description = Create a file or replace its whole content. Prefer edit_file for existing files; read a file before overwriting it.\ntool-write-file-content = The full new content of the file.\ntool-edit-file-description = Replace an exact piece of a file. old must match the file character for character (indentation and line breaks included) and occur once; add surrounding lines if it is not unique, and set all only to replace every occurrence.\ntool-edit-file-old = The text to replace, copied verbatim from the file.\ntool-edit-file-new = The replacement text.\ntool-edit-file-all = When true, replace every occurrence.\ntool-run-command-description = Run a command in the workspace folder and return its exit code and output (about 12000 characters, keeping the end). Asks the user first unless they already allowed that kind of command. Do not use it to read or write files, commit or push.\ntool-run-command-command = The command to run.\ntool-run-command-reason = One sentence on why, shown to the user.\nworkspace-section = Workspaces\nthread-section-other = Other conversations\nworkspace-new-thread = New conversation here\nworkspace-new-thread-in = New conversation in a workspace…\nworkspace-more = More\nworkspace-more-threads = { $count } more ⌄\nworkspace-add = New workspace…\nworkspace-remove = Remove from list\ncode-open-editor = Open in editor\nworkspace-drop = Drop to add { $name } as a workspace\nstep-list_dir = List { $detail }\nstep-list_dir-plain = List folder\nstep-read_file = Read { $detail }\nstep-read_file-plain = Read file\nstep-search_files = Search code for "{ $detail }"\nstep-search_files-plain = Search code\nstep-write_file = Write { $detail }\nstep-write_file-plain = Write file\nstep-edit_file = Edit { $detail }\nstep-edit_file-plain = Edit file\nstep-run_command = Run { $detail }\nstep-run_command-plain = Run command\ncode-panel = Code\ncode-tab-changes = Changes\ncode-tab-terminal = Terminal\ncode-files = Files\ncode-files-search = Search file names\ncode-files-collapse = Hide files\ncode-files-expand = Show files\ncode-mark-changed = M\ncode-mark-added = N\ncode-changes-head = { $count } files changed in this conversation\ncode-diff-unified = Unified\ncode-diff-split = Split\ncode-open = Open\ncode-revert-file = Revert file\ncode-revert-hunk = Revert block\ncode-hunk-near = @@ near line { $line }\ncode-new-file = New file\ncode-deleted-file = Deleted\ncode-binary = Binary file, no diff shown\ncode-no-changes = No files changed in this conversation yet. When Xiaoban changes files they are listed here, and every block can be reverted.\ncode-status-uncommitted = { $count } uncommitted files\ncode-status-ahead = · { $count } commits ahead of { $upstream }\ncode-status-clean = No uncommitted changes\ncode-status-no-git = Not a git repository\ncode-file-changed = Changed by Xiaoban\ncode-see-changes = See changes\ncode-add-input = Add to message\ncode-copy = Copy\ncode-copy-path = Copy path\ncode-look = Have Xiaoban look at this file\ncode-look-text = Take a look at { $path }\ncode-file-binary = This is a binary file and cannot be shown.\ncode-file-truncated = The file is long; only the beginning is shown.\ncode-quote = { $path } { $from }–{ $to }\ncode-terminal-agent = Xiaoban $\ncode-terminal-you = You $\ncode-terminal-input = Type a command and press Return\ncode-terminal-empty = Commands you and Xiaoban run in this workspace are listed here.\ncode-terminal-failed = ✗ exit { $code }\ncode-terminal-stopped = Stopped\ncode-seconds = { $seconds }s\ncode-branch-changes = { $count } uncommitted files\ncode-changed-count = { $count } files changed\ncode-view = View\ncode-card-title = { $count } files changed this time\ncode-card-view = See changes\ncode-card-revert-all = Revert all\ncode-card-reverted = Reverted\nconfirm-run-title = Run a command · needs your OK\nconfirm-run-cwd = Runs in { $cwd }\nconfirm-run-once = Allow once\nconfirm-run-always = Always allow { $rule } here\nconfirm-run-no = Don\'t allow\nconfirm-read-title = Read a file outside the workspace · needs your OK\nconfirm-read-always = Allow reading { $folder }\nconfirm-write-title = Change a file outside the workspace · needs your OK\nconfirm-write-always = Allow changes in { $folder }\ncode-close-tab = Close { $name }\ncode-added = +{ $count }\ncode-removed = −{ $count }\ncode-terminal-ok = ✓\ncode-terminal-running-for = Running · { $seconds }s\ncode-terminal-stop = Stop\ncode-terminal-queued = Queued\ncode-terminal-input-busy = Keep typing; Return queues it after the current one\ncode-resize = Drag to resize, double-click to reset\ncode-resize-width = { $width } px · double-click to reset\nbranch-menu = Switch branch\nbranch-search = Search branches\nbranch-current = Current · { $count } uncommitted files\nbranch-current-clean = Current\nbranch-remote = Remote { $name }\nbranch-remote-behind = Remote { $name } · { $count } behind\nbranch-new = New branch from here…\nbranch-new-placeholder = New branch name, Return to create\nbranch-pull = Pull latest (git pull)\nbranch-switch-title = Before switching to { $name }\nbranch-switch-body = { $branch } has { $count } uncommitted files.\nbranch-switch-stash = Put them aside, restore when back\nbranch-switch-carry = Take the changes along\nbranch-switch-hint = Putting aside uses git stash; Xiaoban reminds you to restore it when you come back.\nbranch-failed = Didn\'t work: { $detail }\nbranch-stashed = Changes were put aside on this branch\nbranch-restore = Restore\ncode-preview = Preview\ncode-source = Source\ncode-image-size = { $width } × { $height } · { $size }\ncode-image-hint = Click to zoom · Space\ncode-image-failed = This image can\'t be shown; it may be too large or an unsupported format.\ntool-git-description = Run git in the workspace. args is the argument list starting with the subcommand, e.g. ["status"], ["diff","--","src/a.ts"], ["log","--oneline","-n","20"], ["commit","-m","message"]. Read-only commands (status, diff, log, show, blame, listing branches) run directly; anything that changes the repository (commit, push, switch, merge, pull, stash, reset…) asks the user first. Do not commit, push or switch branches unless asked.\ntool-git-args = Arguments for git, without the leading git.\ntool-gh-description = Run the GitHub CLI (gh) in the workspace to read pull requests, issues and checks. args is the argument list, e.g. ["pr","list","--state","open"], ["pr","view","42","--json","title,state,statusCheckRollup"], ["issue","view","17"], ["api","repos/:owner/:repo/pulls"]. list, view, checks, diff, status and reading api calls run directly; creating, merging, commenting or closing asks the user first. Add --json when you need structured results.\ntool-gh-args = Arguments for gh, without the leading gh.\nstep-git = git { $detail }\nstep-git-plain = Run git\nstep-gh = gh { $detail }\nstep-gh-plain = Check GitHub\nref-open = Open\nref-draft = Draft\nref-merged = Merged\nref-closed = Closed\nref-checks-passed = Checks passed\nref-checks-failed = { $count } checks failed\nref-checks-pending = Checks { $done }/{ $total }\nref-pr-label = PR #{ $number }\nref-issue-label = Issue #{ $number }\nref-files = { $count } files\nref-comments = { $count } comments\nref-more-checks = { $count } more\nref-look-failure = Ask Xiaoban why it failed\nref-ask-failure = Look at why the checks on PR #{ $number } failed and tell me the cause and the fix.\nref-pin = Pin under the title\nref-unpin = Unpin\nref-open-browser = Open in browser\nref-pins-more = { $count } more ⌄\nref-pins-less = Show less ⌃\nref-pr-where = PR #{ $number } · { $repo }\nref-issue-where = Issue #{ $number } · { $repo }\nref-number = #{ $number }\nprompt-commit-message = You are writing a git commit message. You get the repository\'s recent commit messages (to follow its style and language), the files being committed and the diff. Match the existing style: write in the same language, and use prefixes like feat:/fix: only if the history does. The first line is a short summary (at most 72 characters) of what changed; if the change is large, add a blank line and one or two sentences on why. Output only the message, with no quotes, code fences or anything else.\ncommit-draft-recent = Recent commit messages:\ncommit-draft-files = Files being committed:\ncommit-draft-diff = Changes:\ncode-tab-git = Git\ngit-not-repo = This folder isn\'t using git yet\ngit-not-repo-hint = Coding still works: Xiaoban keeps the original before each change, so Changes can show and revert them.\ngit-init = Initialize git\ngit-ahead = On { $upstream } · { $ahead } ahead · { $behind } behind\ngit-working = Uncommitted\ngit-working-files = { $count } files\ngit-this-branch = This branch\ngit-all-branches = All branches\ngit-commit = Commit…\ngit-commit-meta = { $short } · { $author } · { $time } · { $count } files\ngit-copy-hash = Copy hash\ngit-explain = Ask Xiaoban about this commit\ngit-explain-text = Explain what commit { $short } changed and why.\ngit-commit-open = Commit…\ngit-pr = Open pull request\ngit-pr-opening = Pushing…\ncommit-title = Commit { $count } files\ncommit-drafting = Xiaoban is writing the message…\ncommit-placeholder = Commit message\ncommit-hint = Xiaoban wrote this from the changes; edit freely ·\ncommit-redraft = Rewrite\ncommit-message = Commit message\ncommit-only = Commit\ncommit-push = Commit and push\nbranch-switch-commit = Commit first, then switch…\nconflict-tab = Conflicts\nconflict-mark = C\nconflict-number = Conflict { $number }/{ $total }\nconflict-where = { $path } line { $line }\nconflict-ours = This side · { $branch }\nconflict-theirs = Other side · { $branch }\nconflict-incoming = incoming\nconflict-use-ours = Use this side\nconflict-use-theirs = Use the other side\nconflict-use-both = Keep both\nconflict-ask = Let Xiaoban merge\nconflict-editor = Edit in editor\nconflict-ask-text = There is a merge conflict in { $path } near line { $line } (this side is the current branch, the other is { $incoming }). Read both sides and the context, replace the conflict markers with a merge that keeps both intents, and tell me how you decided.\nconflict-banner = Merging { $incoming } into { $branch }\nconflict-count = { $files } files, { $blocks } conflicts\nconflict-none-left = All conflicts are resolved; click Finish merge.\nconflict-left = { $count } files still have conflicts\nconflict-all-done = All conflicts resolved\nconflict-abort = Abort merge\nconflict-finish = Finish merge\nconflict-abort-title = Abort this merge?\nconflict-abort-body = This goes back to how things were before the merge; resolved conflicts are lost too.\nconflict-bar = Merging · { $count } files with conflicts\nconflict-bar-done = Merging · all conflicts resolved\nworkspace-new-title = New workspace\nworkspace-new-empty = No folder chosen yet\nworkspace-new-choose = Choose…\nworkspace-rule-inside = Inside this folder, Xiaoban reads and writes files without asking\nworkspace-rule-ask = Files outside it, commands, commits and pushes all ask you first\nworkspace-rule-undo = Every change is recorded and can be reverted\nworkspace-new-git = Git repository found · on { $branch }\nworkspace-new-no-repo = This folder isn\'t a git repository; changes can still be viewed and reverted\nworkspace-new-no-git = Git isn\'t installed; changes can still be viewed and reverted\nworkspace-new-start = Start\nworkspace-new-hint = You can also drag a folder onto the sidebar\ncode-undone-file = Reverted to how it was\ncode-undone-block = A block was just reverted\ncode-restore = Restore\nstep-ran-ok = passed\nstep-ran-failed = failed (exit { $code })\nstep-ran-timeout = stopped after timing out\nstep-declined = you didn\'t allow it\ncommand-pill-ok = { $command } passed · view in terminal ›\ncommand-pill-failed = { $command } failed (exit { $code })\ncommand-pill-timeout = { $command } timed out\ncommand-pill-declined = Not run · { $command }\nmd-alert-note = Note\nmd-alert-tip = Tip\nmd-alert-important = Important\nmd-alert-warning = Warning\nmd-alert-caution = Caution\nworkspace-settings = Workspace settings…\nworkspace-settings-title = Workspace settings\nworkspace-settings-none = None yet\nworkspace-settings-remove = Remove\nworkspace-settings-name = Name\nworkspace-settings-place = Location\nworkspace-settings-place-hint = To use another folder, create a new workspace; conversations stay with this one\nworkspace-settings-editor = Open files in\nworkspace-settings-editor-auto = Auto\nworkspace-settings-editor-system = System default\nworkspace-settings-editor-hint = Auto looks for Cursor, VS Code, then Zed\nworkspace-settings-commands = Allowed commands\nworkspace-settings-commands-hint = Commands starting with these run without asking; chained commands with && ; | still ask every time\nworkspace-settings-read = Folders outside it Xiaoban may read\nworkspace-settings-write = Folders outside it Xiaoban may change\nworkspace-settings-write-hint = Folders it may change are readable too\nworkspace-settings-done = Done\nworkspace-remove-title = Remove "{ $name }" from the list?\nworkspace-remove-body = It only leaves the sidebar; the folder and conversations are not deleted.\nref-table-headers = #, PR, Issue, No., Number, PR #, Issue #\nkitchen-thread-title = Kitchen\nkitchen-context-label = The kitchen right now (fridge, servings, avoid, suggestions, shopping list)\nprompt-kitchen = This is the kitchen conversation: help decide what to cook tonight, how, and what to buy. When the user sends a fridge photo, identify the ingredients and record them with kitchen_fridge (replace when the whole fridge was re-photographed); then suggest 3 dishes with kitchen_dishes based on what is there, servings, things to avoid and time (home cooking, doable, use up what spoils first), listing what each uses and what is missing. Servings, avoid and time come from memory; when the user says "just 2 of us today" or "something spicy", update them with kitchen_preferences and suggest again. Add things to buy with shopping_add when asked. When the user starts cooking, use cook_steps to interleave the chosen dishes into steps with heat and timer seconds. While cooking, answer questions like how much salt briefly, based on the current step. When they say they\'re done, ask how it tasted and remember worthwhile preferences. Keep replies short and don\'t repeat the suggestions; the app shows them. When the user wants a weekly menu, use week_plan with the dates in calendar: weekdays within the max minutes, weekends can be more involved, reuse leftovers and stews, a takeout night is fine; list what to buy and mark frozen, chilled or room (meat eaten days later goes frozen), and put thawing and marinating in prep. For "swap Thursday for fish" change only that day and update buy. buy only shows on the week menu; it reaches the shopping list when the user taps "Add all to shopping list", so never say it was already added.\ntool-kitchen-fridge-description = Record what is in the fridge, after a fridge photo or when the user says something ran out.\ntool-kitchen-fridge-items = Ingredients; existing ones get their amount updated.\ntool-kitchen-fridge-replace = When true, clear first (the whole fridge was re-photographed).\ntool-kitchen-fridge-remove = Names of ingredients to remove.\ntool-kitchen-item-name = Short ingredient name, like "eggs".\ntool-kitchen-item-amount = Amount, like "8", "half", "500g"; leave empty if unsure.\ntool-kitchen-dishes-description = Give tonight\'s suggestions (replaces the previous batch). Usually 3, balanced.\ntool-kitchen-dish-name = Dish name.\ntool-kitchen-dish-minutes = Roughly how many minutes to cook.\ntool-kitchen-dish-why = One sentence on why, such as using up something about to spoil.\ntool-kitchen-dish-uses = Ingredients from the fridge it uses.\ntool-kitchen-dish-missing = Missing ingredients with amounts, like "beef 500g".\ntool-kitchen-preferences-description = Change this meal\'s conditions: servings, things to avoid, maximum minutes.\ntool-kitchen-servings = How many people.\ntool-kitchen-avoid = Things to avoid, like "peanuts". Replaces the list.\ntool-kitchen-max-minutes = Maximum minutes to cook.\ntool-shopping-add-description = Add things to the shopping list.\ntool-shopping-note = A note, like which kind or where to buy.\nkitchen-title = Kitchen\nkitchen-back = ‹ Daily\nkitchen-tab-tonight = Tonight\nkitchen-tab-shopping = Shopping list\nkitchen-chat = Talk to Xiaoban\nkitchen-chat-note = Kitchen conversation\nkitchen-chat-hint = Drop in a fridge photo or ask "what\'s for dinner?". Saying "just 2 of us" or "something spicy" updates the suggestions.\nkitchen-chat-placeholder = Something spicy, less oil…\nkitchen-thinking = Thinking…\nkitchen-minutes = { $minutes } min\nkitchen-missing = Missing { $items }\nkitchen-have-all = Have everything\nkitchen-uses = Uses: { $items }\nkitchen-joiner = , \nkitchen-plus = { " + " }\nkitchen-photo-filter = Images\nkitchen-photo-message = Here\'s my fridge right now. What\'s in it, and what should we have tonight?\nkitchen-fridge = In the fridge\nkitchen-retake = Retake / drop a photo\nkitchen-add-photo = Add a fridge photo\nkitchen-photo-empty = No fridge photo yet\nkitchen-photo-when = Taken { $when }\nkitchen-item = { $name } { $amount }\nkitchen-fridge-empty = Send a fridge photo, or tell Xiaoban on the right what\'s in it.\nkitchen-used-hint = Blue ones are used by the dishes you picked\nkitchen-rules = This time\nkitchen-servings = { $count } servings\nkitchen-servings-unknown = Servings not known yet\nkitchen-avoid = No { $items }\nkitchen-within = Within { $minutes } min\nkitchen-rules-hint = From memory; say "just 2 of us" on the right to change it\nkitchen-suggested = From your fridge\nkitchen-suggested-note = All within { $minutes } min · { $count } picked\nkitchen-another = Others\nkitchen-another-batch = Suggest a different set\nkitchen-empty-title = What\'s for dinner?\nkitchen-empty-body = Take a fridge photo and Xiaoban suggests three dishes from what\'s there, who\'s eating, what to avoid and how much time you have.\nkitchen-ask = Just ask\nkitchen-ask-tonight = What should we have tonight?\nkitchen-summary = About { $minutes } min · { $servings } servings ·{ " " }\nkitchen-summary-missing = { $count } missing\nkitchen-summary-all = have everything\nkitchen-add-missing = Add missing to shopping list\nkitchen-start = Let\'s make { $dishes }. Walk me through it step by step.\nkitchen-start-button = Start cooking ›\nkitchen-shopping-left = { $count } to buy\nkitchen-clear-bought = Clear bought\nkitchen-shopping-empty = The shopping list is empty. Pick dishes and add what\'s missing, or say "remember to buy milk" on the right.\ndaily-morning = Good morning\ndaily-afternoon = Good afternoon\ndaily-evening = Good evening\ndaily-hello-name = { $greeting }, { $name }\ndaily-talk = Talk to Xiaoban…\ndaily-confirm = Waiting for you · { $count }\ndaily-food = What\'s for dinner\ndaily-dot = { " · " }\ndaily-open-kitchen = Open kitchen ›\ndaily-shopping = { $count } on the shopping list\ndaily-food-empty = Take a fridge photo and Xiaoban works out tonight\'s dinner and what to buy.\ndaily-food-start = Open kitchen\ndaily-more-title = More will show up here\ndaily-more-body = Schedule and reminders, plan progress, things Xiaoban did for you. Say "remind me to pay rent on Friday" to start.\ntool-kitchen-dish-photo = The common English name of the dish, used to find a photo, like "Mapo tofu".\nkitchen-listening = Listening… release ⌥ Space or click the mic again\ntool-week-plan-description = Plan or change a week of dinners. For a full replan pass all 7 days plus prep and buy; to swap one day pass only that day (pass buy or prep only if they change; they replace the whole list).\ntool-week-start = The Monday of that week, e.g. 2026-11-02.\ntool-week-idea = One or two sentences on the plan: timing, how leftovers carry over, why a takeout day.\ntool-week-days = Dinner for each day.\ntool-week-day-date = Date, YYYY-MM-DD.\ntool-week-day-dish = Dish name; join several with " + "; write "Takeout" for a night off.\ntool-week-day-why = A very short reason, like "kids love it".\ntool-week-day-takeout = No cooking this day (takeout or eating out).\ntool-week-prep = Things to do ahead (marinate, move frozen meat to the fridge to thaw); the user gets reminded on time.\ntool-week-prep-time = Reminder time, HH:MM, e.g. 20:00.\ntool-week-prep-text = What to do, one sentence.\ntool-week-buy = Ingredients for the week; list what is already in the fridge too and mark have.\ntool-week-item-note = A very short note, like "used Tuesday" or "buy on the day".\ntool-week-item-group = Group: produce, meat and eggs, staples and sauces, etc.\ntool-week-item-have = Already in the fridge.\ntool-week-keep = Where it goes when bought: frozen (meat eaten days later), chilled, or room.\ntool-cook-steps-description = Call when the user starts cooking: interleave the chosen dishes into one list of steps (put parallel work together, like cutting tomatoes while broccoli soaks). The app switches to cooking mode.\ntool-cook-minutes = Roughly how many minutes the whole meal takes from prep to the last dish served, counting the interleaved schedule (soaking, marinating and waiting for water to boil included).\ntool-cook-dishes = The dishes being cooked.\ntool-cook-step-dish = Which dish this step belongs to.\ntool-cook-step-text = What to do, in one sentence readable from the stove.\ntool-cook-step-tip = Optional tip, like how to tell the oil is hot or how much salt.\ntool-cook-step-heat = Heat: high, medium, low or none.\ntool-cook-step-seconds = Seconds to time this step; 0 if no timer.\ntool-cook-step-after = What to do when the timer ends, like "drain and rinse in cold water".\nheat-high = High heat\nheat-medium = Medium heat\nheat-low = Low heat\nheat-none = No heat\nkitchen-resume-cook = Back to cooking ›\ncook-back = ‹ Kitchen\ncook-title = Cooking\ncook-meta = Serves { $servings } · about { $minutes } min · screen kept on\ncook-done = Done\ncook-planning = Xiaoban is planning the steps…\ncook-steps-head = Steps · { $count } dishes interleaved\ncook-check = ✓\ncook-timing = Timing\ncook-step-n = Step { $n }\ncook-progress = Step { $n } of { $total } · { $dish }\ncook-timer-label = { $dish } · step { $step }\ncook-start-timer = Start timer { $time }\ncook-timer-running = Timing { $left }\ncook-prev = ‹ Previous\ncook-next = Next ›\ncook-you-asked = You asked: { $text }\ncook-ask-placeholder = Ask Xiaoban: is the heat too high…\ncook-talk = Hold to talk ⌥ Space\ncook-finished-message = Done cooking.\ntimer-head = Timers · { $count }\ntimer-hint = When time is up it rings and sends a notification; timers keep running on other pages or when minimized\ntimer-add = + Add one\ntimer-label = Name\ntimer-minutes = min\ntimer-start-short = Start\ntimer-default-label = Timer\ntimer-done = Done\ntimer-ok = Got it\ntimer-extend = +30 s\ntimer-done-title = { $label } is done\ntimer-done-body = Check the kitchen\ntimer-done-banner = ⏰ { $label } is done\ntimer-then =  · { $after }\nkitchen-tab-week = Week menu\nkeep-frozen = Freezer\nkeep-chilled = Fridge\nkeep-room = Pantry\nweek-title-this = This week\'s dinners\nweek-title-next = Next week\'s dinners\nweek-title-other = Dinners that week\nweek-subtitle = { $range } · dinner · weekdays within { $minutes } min, weekends can be fancier\nweek-prev = ‹ Last week\nweek-next = Next week ›\nweek-replan = Replan the week\nweek-today = Today\nweek-changed = Changed\nweek-swap = Swap\nweek-fill = Plan this day\nweek-day-label = { $weekday } ({ $date })\nweek-idea = How Xiaoban planned it\nweek-prep = Do ahead\nweek-prep-item = { $day } { $time }: { $text }\nweek-prep-note = You\'ll get a reminder\nweek-buy = To buy this week · { $count }\nweek-buy-note = Crossed out if already in the fridge; each marked freezer, fridge or pantry\nweek-buy-add = Add all to shopping list\nweek-buy-added = Added to shopping list\nweek-have = In fridge\nweek-empty-title = No menu for this week yet\nweek-empty-body = Xiaoban plans a week of dinners and what to buy, from what\'s in your fridge, how many people eat and what you avoid. You can swap any day later.\nweek-empty-start = Plan this week\nweek-empty-hint = Or say on the right "lighter food this week" or "friends coming on the weekend"\nweek-plan-message = Plan dinners for { $range } (Monday is { $start }).\nweek-replan-message = Replan dinners for { $range } (Monday is { $start }).\nweek-swap-message = Swap "{ $dish }" on { $day }.\nweek-fill-message = Nothing planned for { $day } yet, please pick a dish.\nprep-due-title = Kitchen reminder\nfridge-hint = Blue items are used by the picked dishes; hover and tap × to remove, tap a name to change the amount\nfridge-remove = Remove { $name }\nfridge-left = Left\nfridge-amount-placeholder = e.g. 2, half\nfridge-used-up = Used up\nfridge-used-up-shop = Used up, add to list\nfridge-edit-hint = Enter saves · Esc closes\nfridge-stale = This photo is { $days } days old and some things may be gone. Tap × on what\'s missing, or retake it.\nweek-gone = Gone, buy it\nweek-gone-message = We\'re actually out of { $name }; add it to buy with an amount and where to keep it.\nprompt-ledger = This is the expenses conversation. When the user says "lunch 38.5 beef noodles" or "taxi 25", record it with ledger_add (no time means now; turn "yesterday" into a concrete date and time) and reply with one line of what was recorded. For a receipt photo, read the merchant, total and main contents and record it as receipt; if it mixes categories (tissues in a grocery run), record it under the main one and ask whether to split. Prefer categories already in categories_in_use; common ones are dining, household, transport, kids, housing, health, fun, clothes, gifts, other. Edit, delete or split with ledger_edit / ledger_delete using ids from recent. Use ledger_budget when the user sets a budget. For an imported bill, give every key in keys_to_categorize a category in one ledger_import_categories call, then say in one sentence that it is sorted and ask the user to check the dialog before adding; never record the rows yourself. Keep replies short; the app shows the details.\nledger-thread-title = Expenses\nledger-context-label = Expenses state\nledger-import-label = Bill file just imported (parsed on this computer; the user confirms in a dialog)\nledger-import-failed = No transactions could be read from this file. Ask the user to check it was exported with "Download bill" in Alipay or WeChat (CSV or Excel).\nledger-other = Other\ntool-ledger-add-description = Record one or more expenses.\ntool-ledger-edit-description = Change a recorded expense (amount, name, category, time); pass only what changes.\ntool-ledger-delete-description = Delete expenses recorded by mistake.\ntool-ledger-budget-description = Set the monthly budget; 0 means none.\ntool-ledger-budget-amount = Monthly budget in yuan.\ntool-ledger-sort-description = Give each key of the imported bill a category.\ntool-ledger-sort-key = The key exactly as in keys_to_categorize.\ntool-ledger-amount = Amount in yuan, e.g. 38.5.\ntool-ledger-name = A short name, like "Lunch · beef noodles" or "Subway".\ntool-ledger-category = Category, like dining, household, transport, kids.\ntool-ledger-time = Time as YYYY-MM-DD HH:MM; omit if unknown.\ntool-ledger-source = said if the user said it, receipt if read from a receipt photo.\ntool-ledger-note = Optional note, like the merchant.\ntool-ledger-id = The expense id.\ndaily-money = Spent this month\ndaily-money-budget = / budget { $amount }\ndaily-money-empty = Nothing recorded yet. Tell Xiaoban "lunch 38", or import an Alipay or WeChat bill to start.\ndaily-open-ledger = Open expenses ›\nledger-title = Expenses\nledger-prev = ‹\nledger-next = ›\nledger-prev-month = Previous month\nledger-next-month = Next month\nledger-spent = Spent in month { $month }\nledger-left = { $amount } left\nledger-over = { $amount } over\nledger-pace-even = { " · " }on pace to just make it\nledger-pace-save = { " · " }on pace to save { $amount }\nledger-pace-over = { " · " }on pace to go { $amount } over\nledger-past-left = Saved { $amount } this month\nledger-past-over = Went { $amount } over this month\nledger-budget = Budget { $amount }\nledger-no-budget = No budget yet\nledger-budget-edit = Edit\nledger-budget-set = Set one\nledger-budget-label = Monthly budget ¥\nledger-by-category = By category\nledger-filter-hint = Tap one to filter\nledger-filter-on = Only "{ $category }" · tap again to clear\nledger-noticed = Noticed\nledger-noticed-up = { $category } is { $amount } higher than this time last month (+{ $pct }%).\nledger-open-week = See this week\'s menu\nledger-mute = Don\'t remind me\nledger-flow-head = { $scope } · month { $month } · { $count }\nledger-all = All\nledger-search = Search…\nledger-import = Import bill\nledger-flow-empty = Nothing recorded this month.\nledger-flow-hint = Hover an entry to edit or delete; drop a receipt photo or bill file anywhere in the window to record it\nledger-today = Today\nledger-yesterday = Yesterday { $date }\nledger-source-said = Said\nledger-source-receipt = Receipt\nledger-source-import = Bill import\nledger-edit = Edit\nledger-delete = Delete\nledger-save = Save\nledger-cancel = Cancel\nledger-edit-name = Name\nledger-edit-category = Category\nledger-edit-amount = Amount\nledger-app-alipay = Alipay bill\nledger-app-wechat = WeChat bill\nledger-import-meta = { $app } · { $from }–{ $to } · { $count } rows\nledger-import-summary = Sorted: { $fresh } new will be added; { $dup } match what you already recorded and are skipped; { $skipped } transfers, refunds and income are left out unless you tick them.\nledger-import-sorting = Xiaoban is sorting…\nledger-import-note = Tap a category to change it · the file is read on this computer only\nledger-import-commit = Add { $count }\nledger-status-new = New\nledger-status-duplicate = Already recorded\nledger-status-transfer = Transfer, skipped\nledger-status-refund = Refund, skipped\nledger-status-income = Income, skipped\nledger-empty-title = Nothing recorded yet\nledger-empty-body = Three ways, use any:\nledger-empty-say = Say "lunch 38" or "taxi 25" on the right\nledger-empty-receipt = Drop a receipt photo in\nledger-empty-bill = Import a bill exported from Alipay or WeChat ("Bills → Download bill" in their app, sent to this computer)\nledger-empty-import = Import a bill file\nledger-empty-budget = Set a monthly budget\nledger-bill-filter = Bill files\nledger-import-message = Import this bill.\nledger-receipt-message = Record this receipt.\nledger-chat-note = Expenses conversation\nledger-chat-hint = Say "lunch 38.5 beef noodles" to record it; or drop in a receipt photo or bill file.\nledger-chat-placeholder = lunch 38, taxi 25…\nledger-cat-dining = Dining\nledger-cat-household = Household\nledger-cat-transport = Transport\nledger-cat-kids = Kids\nledger-cat-housing = Housing\nledger-cat-health = Health\nledger-cat-fun = Fun\nledger-cat-clothes = Clothes\nledger-cat-gifts = Gifts\nledger-cat-other = Other\nledger-picker = Pick a period\nledger-picker-label = { $title } ▾\nledger-picker-month = By month\nledger-picker-range = Date range\nledger-year = { $year }\nledger-prev-year = Previous year\nledger-next-year = Next year\nledger-month-short = Month { $month }\nledger-month-none = None\nledger-picker-month-hint = Each cell is what that month cost; future months can\'t be picked\nledger-preset-week = This week\nledger-preset-last-week = Last week\nledger-preset-7 = Last 7 days\nledger-preset-30 = Last 30 days\nledger-preset-year = This year\nledger-range-days = { $range } · { $days } days\nledger-range-go = Show these days\nledger-picker-range-hint = Tap a start day, then an end day\nledger-picker-range-note = Tap a start day, then an end day; a dot means something was recorded; ranges can cross months\nledger-prev-range = Earlier period\nledger-next-range = Later period\nledger-range-spent = Spent { $range }\nledger-range-count = { $days } days\nledger-range-daily = { $amount } a day\nledger-range-more = { $amount } more than the { $days } days before\nledger-range-less = { $amount } less than the { $days } days before\nledger-flow-head-range = { $scope } · { $range } · { $count }\nledger-this-month = Back to this month\nweather-home = Home\nweather-sky-clear = Clear\nweather-sky-cloudy = Partly cloudy\nweather-sky-overcast = Overcast\nweather-sky-fog = Fog\nweather-sky-light-rain = Light rain\nweather-sky-rain = Rain\nweather-sky-heavy-rain = Heavy rain\nweather-sky-snow = Snow\nweather-sky-storm = Thunderstorm\nweather-mon = Monday\nweather-tue = Tuesday\nweather-wed = Wednesday\nweather-thu = Thursday\nweather-fri = Friday\nweather-sat = Saturday\nweather-sun = Sunday\nweather-tip-rain = Rain after { $hour }:00 ({ $chance }%), take an umbrella\nweather-tip-rain-peak = Heaviest around { $hour }:00, { $chance }% chance\nweather-tip-cold = Tomorrow is { $drop }° colder, dress warmer\nweather-tip-cold-detail = Tomorrow { $low }° – { $high }°\nweather-tip-sun = { $day } is sunny, good for airing the bedding\nweather-tip-sun-detail = Best sun from 10:00 to 15:00\nweather-tip-air = Poor air (index { $aqi })\nweather-tip-air-detail = Keep windows shut and wear a mask outside\nweather-alert-summary = Today { $low }°–{ $high }°, { $sky }\nweather-alert-rain = Rain is coming\nweather-alert-rain-body = Starts around { $hour }:00, heaviest near { $peak }:00 ({ $chance }%). Take an umbrella.\nweather-alert-raining = It is raining\nweather-title = Weather\ndaily-open-weather = Open ›\nweather-degrees = { $value }°\nweather-percent = { $value }%\nweather-now = Now\nweather-hour = { $hour }:00\nweather-now-line = { $sky } · feels like { $feels }°\nweather-sky-range = { $sky } · { $low }° – { $high }°\nweather-today = Today\nweather-range = { $low }° – { $high }°\nweather-air = Air\nweather-aqi = { $level } { $value }\nweather-aqi-1 = Good\nweather-aqi-2 = Moderate\nweather-aqi-3 = Unhealthy for some\nweather-aqi-4 = Unhealthy\nweather-aqi-5 = Very unhealthy\nweather-aqi-6 = Hazardous\nweather-sun-times = Sunrise / sunset\nweather-uv = UV\nweather-uv-1 = Low\nweather-uv-2 = Moderate\nweather-uv-3 = High\nweather-uv-4 = Very high\nweather-uv-5 = Extreme\nweather-hours = Next 24 hours\nweather-hours-note = Orange is temperature, blue is the chance of rain\nweather-tips = Xiaoban suggests\nweather-days = Next 7 days\nweather-rules = When to remind me\nweather-rule-today = Today\'s weather\nweather-rule-today-note = Sent the first time you use the computer each day: temperature, umbrella or not, warmer or colder than yesterday. Whenever you get up.\nweather-rule-today-fixed = Sent at this time every day: temperature and whether to take an umbrella.\nweather-rule-rain = Rain coming\nweather-rule-rain-note = An hour before rain; if you\'re away (asleep, out) it waits and tells you when you\'re back.\nweather-rule-rain-fixed = An hour before rain (between 7:00 and 23:00).\nweather-rule-cold = Colder tomorrow\nweather-rule-cold-note = Once in the evening while you\'re still at the computer (5° or more colder).\nweather-rule-cold-fixed = When tomorrow is 5° or more colder, at this time.\nweather-rule-air = Poor air\nweather-rule-air-note = When the air index goes above 150 while you\'re at the computer.\nweather-rhythm = Lately you usually start using the computer around { $start } and stop around { $end }.\nweather-rhythm-learning = Xiaoban is still learning when you usually start; it will show here in a few days.\nweather-rhythm-make-fixed = Use fixed times\nweather-rhythm-fixed = Reminders use fixed times now.\nweather-rhythm-follow = Follow my computer use again\nweather-rhythm-unsupported = This computer can\'t tell whether the keyboard and mouse are in use, so fixed times are used.\nweather-place = { $city } · { $label }\nweather-add-tab = ＋ Add a place\nweather-add = Add a place\nweather-city-placeholder = Type a city…\nweather-add-label = Call it\nweather-add-go = Add\nweather-add-note = Districts, streets and neighborhoods can be found; place names from OpenStreetMap. Up to 5; reminders follow "Home" only\nweather-updated = Updated { $time } · data from Open-Meteo\nweather-none = Xiaoban doesn\'t know your city yet. Type it, or allow locating once (only used for weather).\nweather-none-failed = Not found. Try another spelling, like "Beijing".\nweather-locate = Locate once\nweather-failed = Weather isn\'t available right now; try again later.\nweather-loading = Getting the weather…\nweather-place-active = { $name } ▾\nweather-place-placeholder = Search a district, street or neighborhood…\nweather-use-here = Use my location\nweather-use-here-where = · { $place }\nweather-menu-name = Name\nweather-menu-where = Place\nweather-menu-located = From your location · within about 1 km\nweather-menu-searched = From search\nweather-menu-move = Change place\nweather-menu-here = Use my location\nweather-menu-home-note = Reminders follow this place\nweather-menu-make-home = Make it home\nweather-menu-remove = Remove this place\nplan-context-label = This conversation\'s plan ([number|status|date] step)\nplan-approved = The user pressed "Go ahead" and approved plan "{ $title }" version { $version }. Start now: work through the steps in order. When you start a step, mark it running with the plan tool\'s update; when it is finished, mark it done and fill in output if it produced something (a document, sheet, deck or key points). Do not ask the user step by step; make small adjustments yourself and record a one-line reason in note. Only use ask, with two or three options, when you would go beyond what was agreed (deadline, spending money, sending messages for the user) or cannot continue. When everything is done, tell the user the result in a sentence or two, plus anything they still need to do themselves.\nplan-continue = Continue with the next step of the plan, same rules as before.\nplan-resumed = The user resumed the paused plan; carry on from the first unfinished step.\nplan-chosen = About the question you stopped on, the user chose: { $option }. Continue the plan accordingly.\nplan-step-done = The user says step { $step } "{ $title }" is done; continue the plan.\nplan-stuck = Stopped at step { $step }; tell Xiaoban how to continue\ntool-plan-description = Manage this conversation\'s plan. When something has several stages (the user asks you to plan it, prepare a presentation, move house, get ready for a trip…), first use propose to draft a plan. Only include steps you can do yourself, each with a short title and a date; things only the user can do (showing up, paying, signing, rehearsing) do not belong in the plan — just mention them in your reply. Put what was agreed in bounds (deadline, budget, no messages sent for the user…). After drafting, say only a sentence or two and wait for the user to press "Go ahead"; if they ask for changes, propose again and fill in changes. While executing, use update for step status, outputs and adjustments; use ask only when going beyond bounds or stuck. The plan card disappears by itself once everything is done. Don\'t make plans for one- or two-step chores.\ntool-plan-title = The plan\'s name, e.g. "Friday client presentation"\ntool-plan-bounds = What was agreed, e.g. "Done by Friday 10:00; never send messages for the user"\ntool-plan-changes = What changed from the previous version, in one sentence\ntool-plan-step-title = What this step does, briefly\ntool-plan-step-due = Date or time, e.g. "Wednesday", "11/6", "Thursday afternoon"\ntool-plan-step-detail = Extra detail (optional)\ntool-plan-step = Step number, starting from 1\ntool-plan-note = An adjustment or remark about this step, in one sentence\ntool-plan-output-label = The output\'s name only, without a "Doc"/"Sheet"/"Deck" prefix, e.g. "Q3 talk outline", "6 key points"\ntool-plan-output-id = The id of the document, sheet or deck, if a tool returned one\ntool-plan-question = What the user needs to decide, and why you stopped\ntool-life-description = Read or change the user\'s life pages: summary shows this month\'s spending, tonight\'s and this week\'s meals, the shopping list and home weather; add_expense records an expense; add_shopping adds to the shopping list. Use it directly when the user casually says "lunch 38" or "remember to buy milk" here, without sending them elsewhere.\nhome-context-label = User\'s home (set on the weather page; use it for weather when no place is named)\ndaily-arrange = Arrange\ndaily-arrange-done = Done\ndaily-arrange-hint = Drag ⋮⋮ to move\ndaily-drag = Drag "{ $title }" to move it\ndaily-drop-here = Drop here\ndaily-size = Width\ndaily-narrow = Narrow\ndaily-wide = Wide\ndaily-hide = Hide\ndaily-hidden = Hidden cards\ndaily-hidden-none = None\ndaily-show = { $title } ＋\ndaily-reset = Reset to default\ndaily-card-confirm = Waiting for you\nprompt-doc = This is a document\'s conversation; the whole document (each paragraph with an id) is in the context notes. When the user asks to change the whole thing or some places, use doc_edit: replace swaps a paragraph (one can become several), insert_after adds after a paragraph, delete removes it; to add a section insert an h2 followed by its body. When the user selects a paragraph and asks for "plain words / shorter / longer / an example / another tone", use doc_suggest with the new wording and let the user decide. Reply with one sentence after editing; never paste the content again.\ndoc-context-label = Full content of "{ $title }" ([paragraph id|kind] text)\ndoc-version-first = First draft by Xiaoban\ndoc-version-user = You edited some places\ndoc-version-restored = Back to version { $version }\ntool-doc-start-description = When the answer is longer than a screen (a checklist, plan, weekly report, contract notes, guide, article), write a document instead of a long reply: call this with the title and section headings, then call doc_section for each section. Short answers stay in chat.\ntool-doc-title = Document title.\ntool-doc-subtitle = Optional one-line subtitle, e.g. who it is for.\ntool-doc-sections = Section headings in order.\ntool-doc-section-description = Write one section of the document: its heading and body paragraphs, in the order given to doc_start.\ntool-doc-id = The doc_id returned by doc_start.\ntool-doc-heading = The section heading.\ntool-doc-kind = Paragraph kind: p paragraph, bullet list item, number numbered item, h3 subheading, quote quotation.\ntool-doc-text = Text; use **bold** for emphasis.\ntool-doc-edit-description = Edit the document with all changes at once. It is saved as a new version and changed places are shown in green.\ntool-doc-note = One sentence on what changed, shown in the version history.\ntool-doc-op = replace, insert_after, or delete.\ntool-doc-block-id = Paragraph id (the first value in brackets in the context notes).\ntool-doc-suggest-description = When the user selects a paragraph and asks for a rewrite, give the new wording (not applied; the user chooses).\ntool-doc-action = What the user asked for, e.g. "plain words", "shorter".\ntool-doc-after = The full rewritten paragraph.\ndoc-icon = Doc\ndoc-writing = Writing section { $n } of { $total }\ndoc-watch = Watch it write\ndoc-meta = Document · about { $chars } characters · { $sections } sections\ndoc-open = Open ›\ndoc-more-sections = { $count } more sections\ndoc-export-word = Export Word\ndoc-export-pdf = Export PDF\ndoc-open-word = Open in Word\ndoc-back = ‹ Back to chat\ndoc-version = Version { $version } ▾\ndoc-version-name = Version { $version }\ndoc-saved = { $chars } characters · saved\ndoc-export = Export ▾\ndoc-outline = Outline\ndoc-outline-hint = Drag to reorder sections\ndoc-mark-undo = Undo\ndoc-mark-keep = Keep\ndoc-act-plain = Plain words\ndoc-act-shorter = Shorter\ndoc-act-longer = Longer\ndoc-act-example = Add an example\ndoc-act-tone = Tone ▾\ndoc-tone-formal = More formal\ndoc-tone-warm = Warmer\ndoc-tone-simple = Simpler\ndoc-act-ask-more = Ask Xiaoban…\ndoc-act-ask = Ask Xiaoban\ndoc-act-ask-placeholder = How should this change? Enter to send\ndoc-ask-action = This paragraph: "{ $action }"\ndoc-ask-question = About the selected paragraph: { $question }\ndoc-selected-label = Paragraph the user selected\ndoc-selected-body = Paragraph id: { $id }; selected text: { $selected }; whole paragraph: { $paragraph }; wanted: { $action }. Use doc_suggest with the new wording.\ndoc-suggestion-head = "{ $action }" · { $where }…\ndoc-use = Use this\ndoc-another-button = Another way\ndoc-another = Try another wording\ndoc-keep-original = Keep original\ndoc-chat-note = This document\'s conversation\ndoc-chat-hint = Say "make it more casual" or "add a section on…", or select a paragraph on the left.\ndoc-chat-placeholder = Ask for changes: more casual, add a section…\ndoc-comparing = Showing what version { $version } changed from version { $previous } (green is changed or new, struck out was removed)\ndoc-compare-exit = Exit compare\ndoc-compare = Compare with previous\ndoc-restore = Go back to this version\ndoc-format-word = Word document\ndoc-format-pdf = PDF (print to PDF)\ndoc-format-md = Markdown\ndoc-format-copy = Copy all text\ndoc-export-note = Saved to Downloads and shown in Finder\ndoc-marks-count = Xiaoban changed { $count } places (in green)\ndoc-marks-keep-all = Keep all\ndoc-marks-undo-all = Undo all\nprompt-sheet = This is a spreadsheet\'s conversation; its content is in the context notes: each line starts with the row number and columns count from A; formulas show as "result [=formula]". When the user asks for changes, use sheet_edit with all changes at once: set writes a block starting at a cell (one array per row, formulas starting with = such as =F2*3, =SUM(B2:B9), =MIN(F2:F8); prefer formulas so results follow the data); insert_rows / insert_cols insert before a cell\'s row or column; delete_rows / delete_cols delete a range; sort sorts by a column (row 1 is the header and stays); add_tab adds a sheet; rename_tab renames; chart draws a chart (labels is the range of names, values the range of numbers). Reply with one sentence; never paste the table again.\nsheet-context-label = Content of the spreadsheet "{ $title }"\nsheet-version-first = First version by Xiaoban\nsheet-version-imported = Opened from your file\ntool-sheet-create-description = When the user wants a table (price comparison, checklist, budget, roster, comparison…) or the data is more than a few rows, make a spreadsheet instead of drawing a table in chat. Give all the data at once, possibly several sheets; write cells that need calculation as formulas starting with =.\ntool-sheet-title = Spreadsheet title.\ntool-sheet-tab = Sheet name.\ntool-sheet-rows = One array per row, the first row is the header; cells that need calculation are formulas starting with = (e.g. =F2*3, =SUM(B2:B9)).\ntool-sheet-edit-description = Edit the spreadsheet with all changes at once; it is saved as a new version and changed cells are shown in green.\ntool-sheet-op = set writes a block, insert_rows / insert_cols insert, delete_rows / delete_cols delete, sort, add_tab, rename_tab, chart.\ntool-sheet-cell = A cell such as H1; insert_rows uses its row, insert_cols / sort use its column.\ntool-sheet-range = A range such as F2:F8.\nsheet-icon = Sheet\nsheet-meta = Spreadsheet · { $rows } rows × { $cols } columns · { $tabs } sheets\nsheet-more-rows = { $count } more rows\nsheet-export-excel = Export Excel\nsheet-export-csv = Export CSV\nsheet-open-excel = Open in Excel\nsheet-open-in-xiaoban = Open in Xiaoban\nsheet-saved = { $tabs } sheets · saved\nsheet-formula = Content of the current cell\nsheet-computed = Calculated; follows the data it uses\nsheet-marks-count = Xiaoban changed { $count } cells (in green)\nsheet-row-above = Insert row above\nsheet-row-below = Insert row below\nsheet-row-delete = Delete { $count } rows\nsheet-col-left = Insert column left\nsheet-col-right = Insert column right\nsheet-col-delete = Delete { $count } columns\nsheet-sort = Sort ▾\nsheet-sort-asc = Sort ascending by this column\nsheet-sort-desc = Sort descending by this column\nsheet-draw = Chart\nsheet-lowest = Mark lowest\nsheet-mark-lowest = Mark the lowest in { $range }.\nsheet-ask-range = About { $range }: { $question }\nsheet-chart = Chart\nsheet-chart-line = Line\nsheet-chart-bar = Bars\nsheet-chart-pie = Pie\nsheet-chart-remove = Remove\nsheet-tab-rename = Rename\nsheet-tab-delete = Delete sheet\nsheet-tab-add = Add a sheet\nsheet-tab-plus = ＋\nsheet-tab-new = Sheet { $n }\nsheet-status-count = { $count } cells\nsheet-status-sum = Sum { $value }\nsheet-status-avg = Average { $value }\nsheet-status-min = Min { $value }\nsheet-status-hint = Double-click to edit, start with = for formulas; select cells to see totals\nsheet-chat-note = This spreadsheet\'s conversation\nsheet-chat-hint = Say "sort by price" or "add a column for 3 people", or select some cells.\nsheet-chat-placeholder = Ask for changes: sort by price, add a column…\nsheet-format-xlsx = Excel workbook\nsheet-format-csv = CSV (current sheet only)\nsheet-format-copy = Copy current sheet\nsheet-export-note = Formulas, bold headers and charts are kept in .xlsx\nprompt-slides = This is a slide deck\'s conversation; every page (with its number) is in the context notes. When the user asks for changes, use slides_edit: replace page N, insert_after page N (0 means first), delete, move_after; "page 4" means change only that page. theme and transition can change too. Pick layouts by content: steps → flow, dates → timeline, A vs B → compare, shrinking stages → funnel, a few features → icons (each with an icon), a quotation → quote, one key number → number, data → chart. Keep pages light: at most 5 points of one sentence each; put details in notes. Reply with one sentence; never paste the content again.\nslides-context-label = All pages of the deck "{ $title }"\nslides-version-first = First version by Xiaoban\ntool-slides-start-description = When the user wants slides, a presentation or a report deck, call this first with the title, theme and every page title, then call slides_page for each page.\ntool-slides-title = Deck title.\ntool-slides-theme = Theme: blue, green, orange or night.\ntool-slides-pages = Page titles in order; the first is usually the cover.\ntool-slides-page-description = Write one page of the deck, in the order given to slides_start.\ntool-slides-deck-id = The deck_id returned by slides_start.\ntool-slides-layout = Layout: title cover, bullets, number (one big figure), chart, two columns, section divider, flow steps, timeline, compare cards, funnel, icons grid, quote.\ntool-slides-page-title = Page title (for quote, the quotation itself).\ntool-slides-subtitle = Subtitle (cover: date and author; number: the line under the figure; quote: the source).\ntool-slides-items = Points / steps / dates / funnel stages / icon cells. text is the main line, note the small print (timeline date, funnel share), value the figure for number, icon an icon name.\ntool-slides-columns = Left and right columns for two and compare, each with a title and lines.\ntool-slides-chart = Chart data: bar, line or pie; highlight is the index (from 0) to emphasize.\ntool-slides-image = Keywords for a photo from a free library, only when a photo helps.\ntool-slides-notes = Speaker notes: what to say on this page.\ntool-slides-edit-description = Edit the deck with all changes at once; changed pages show a before/after card so the user can choose.\ntool-slides-op = replace, insert_after, delete, or move_after (to is the page to follow, 0 means first).\ntool-slides-page-number = Page number from 1 (insert_after may use 0 for the front).\nslides-icon = PPT\nslides-writing = Making page { $n } of { $total }\nslides-meta = Slides · { $pages } pages · theme "{ $theme }"\nslides-top-meta = { $pages } pages · theme "{ $theme }" ▾\nslides-theme-blue = Clean blue\nslides-theme-green = Calm green\nslides-theme-orange = Warm orange\nslides-theme-night = Night\nslides-present = ▶ Present\nslides-export-pptx = Export PPTX\nslides-export-pdf = Export PDF\nslides-open-powerpoint = Open in PowerPoint\nslides-pages = All pages\nslides-add = ＋ Add a page\nslides-new-title = New page\nslides-new-point = Write something\nslides-duplicate = Duplicate page\nslides-delete = Delete page\nslides-notes = Speaker notes\nslides-notes-placeholder = What to say on this page\nslides-empty = No pages yet\nslides-chat-note = This deck\'s conversation\nslides-chat-hint = Say "make page 3 a line chart", "less text everywhere" or "add a summary page"; or click a part of a page.\nslides-chat-placeholder = About page { $n }: line chart, less text…\nslides-ask-page = Page { $n }: { $text }\nslides-part-title = title\nslides-part-subtitle = subtitle\nslides-part-body = content\nslides-part-chart = chart\nslides-part-image = image\nslides-act-shorter = Make the { $part } shorter\nslides-act-reword = Reword the { $part }\nslides-reword = Reword\nslides-chart-bar = Bars\nslides-chart-line = Line\nslides-chart-pie = Pie\nslides-highest = Mark highest\nslides-layout = Layout ▾\nslides-layout-title = Cover\nslides-layout-bullets = Points\nslides-layout-number = Big number\nslides-layout-chart = Chart\nslides-layout-two = Two columns\nslides-layout-section = Section\nslides-layout-flow = Flow\nslides-layout-timeline = Timeline\nslides-layout-compare = Compare\nslides-layout-funnel = Funnel\nslides-layout-icons = Icon grid\nslides-layout-quote = Quote\nslides-image-add = Add a photo\nslides-image-change = Change photo\nslides-image-remove = Remove photo\nslides-image-placeholder = Keywords, e.g. "teamwork"\nslides-image-search = Search\nslides-image-note = Free photos from Wikimedia Commons, with author and license shown\nslides-edit-hint = Enter saves · Esc cancels\nslides-edit-body-hint = One line each, small print after "|"; blank line separates two columns. ⌘Enter saves\nslides-change-head = Page { $n } · before / after\nslides-change-new = New page { $n }\nslides-keep = Use this\nslides-undo = Go back\nslides-undo-new = Remove this page\nslides-versions-hint = Pick a version to go back to it (saved as a new version, nothing is lost)\nslides-transition = Page transition\nslides-transition-fade = Fade\nslides-transition-push = Push\nslides-transition-zoom = Zoom\nslides-transition-none = None\nslides-theme-note = Themes change colors, fonts and background decoration; text and charts stay\nslides-format-pptx = PowerPoint\nslides-format-pdf = PDF (print to PDF, one page each)\nslides-format-png = Images (one PNG per page)\nslides-export-note = Text in the .pptx stays editable; charts are native PowerPoint charts\nslides-next = Next page\nslides-present-progress = { $n } / { $total } · { $time }\nslides-no-notes = No notes for this page\nslides-next-page = Next: { $title }\nslides-last-page = Last page\nslides-present-keys = ← → turn pages · N notes · Esc exit\nplan-sub-draft = Draft · version { $version }; nothing starts until you press "Go ahead"\nplan-sub-done = All done\nplan-sub-blocked = Stopped — needs your call\nplan-sub-paused = Paused\nplan-sub-doing = Xiaoban is on: { $step }\nplan-output-doc = Doc\nplan-output-sheet = Sheet\nplan-output-deck = Deck\nplan-output-text = Notes\nplan-step-doing = In progress\nplan-adjusted = Adjusted\nplan-draft-tag = Draft · v{ $version }\nplan-bounds = Agreed: { $bounds }\nplan-approve = Go ahead\nplan-draft-hint = To change it, just say so — e.g. "prepare 20 questions"\nplan-dismiss = Drop this plan\nplan-blocked-title = { $title } · stopped\nplan-reply = Reply in chat\nplan-undock = Back to top\nplan-collapse = Hide ⌃\nplan-expand = Show ⌄\nplan-resume = Resume\nplan-pause = Pause\nplan-dock = Move to side\ndaily-plans = Plans\ndaily-plans-count = { $count } in progress\ndaily-plans-empty = Ask Xiaoban to "make a plan" and progress shows up here\nplan-ring = { $done }/{ $total }\nplan-output-prefixes = doc|document|sheet|spreadsheet|deck|slides|ppt\ntab-chats = Chats\ntab-daily = Daily\ntab-skills = Abilities\ntab-me = Me\nchats-all = All\nchats-confirm = Needs me · { $count }\nchats-running = In progress · { $count }\nchats-tag-confirm = Needs you\nchats-tag-running = Working\nchats-tag-plan = Plan { $done }/{ $total }\nchats-search = Search\nchats-search-placeholder = Search chats\nchats-primary-empty = Here whenever you need me\nchat-confirm-band = Needs your OK\nchat-sub-primary = Remembers { $memories } things about you\nchat-delete = Delete this chat\nchat-back = Back\nchat-more = More\nchat-placeholder = Say something\nskills-search = Search abilities, or just say what you want\nskills-can-do = Things Xiaoban can do\nskills-quote = "{ $text }"\nskills-try = Try ›\nskills-tray = Try · { $title }\nskills-tray-cancel = Never mind\nskills-tray-send = Send to Xiaoban\nskills-scene-life = Life\nskills-scene-trip = Travel\nskills-scene-cook = Cooking\nskills-scene-docs = Docs & slides\nskills-scene-computer = Computer\nskills-ledger = Expenses\nskills-ledger-example = How much did I spend on takeout this month?\nskills-weather = Weather alerts\nskills-weather-example = Do I need an umbrella tomorrow?\nskills-plan = Make a plan\nskills-plan-example = I\'m presenting to a client on Friday — make me a plan\nskills-trip = Plan a trip\nskills-trip-example = 3 days in Hangzhou over the holiday with a 6-year-old\nskills-trip-change = Change plans on the road\nskills-trip-change-example = It\'s raining — find something indoors this afternoon\nskills-tonight = What\'s for dinner\nskills-tonight-example = I have eggs and tomatoes — what\'s quick?\nskills-week = Weekly menu\nskills-week-example = Weeknight dinners under 20 minutes next week\nskills-cook = Cooking mode\nskills-cook-example = Walk me through teriyaki chicken step by step\nskills-slides = Make slides\nskills-slides-example = Turn this week\'s report into an 8-page deck\nskills-doc = Write a doc\nskills-doc-example = A checklist for signing a rental contract\nskills-sheet = Make a sheet\nskills-sheet-example = Put these flights in a table sorted by price\nskills-operate = Use the computer\nskills-operate-example = File the invoices on my desktop by month\nskills-code = Fix code\nskills-code-example = My blog\'s login page keeps returning 401 — take a look\nme-you = You\nme-days = With you for { $days } days\nme-memories = What it remembers about you\nme-memories-count = All { $count }\nme-memories-hint = Tap any one to delete it, or say "forget this" in chat\nme-forget = Forget this\nme-autonomy = What it can decide on its own\nme-autonomy-current = Current\nme-connected = Connected\nme-computer = Computer\nme-computer-online = Connected · local network\nme-unpair = Unpair from this computer\nme-unpair-title = Unpair?\nme-unpair-body = This phone will stop getting messages from the computer and will need to pair again. Chats and memories on the computer are kept.\nprompt-capability-policy = When you lack an ability for the task (you cannot reach a service, a file type is unsupported, an app operation keeps failing), call find_capability before giving up. Offer the user at most 3 of the options it returns, saying who publishes each, whether it is verified and what it needs, and always also offer a way to do it without installing anything. Only the user can install, by tapping the card in the app; never say you installed or enabled something.\ntool-find-capability-description = Search the MCP registry and skill markets for an extension that adds a missing ability (connecting a service, handling a file format, operating an app). It only returns candidates and never installs anything. Present at most 3 and let the user decide; the app shows them as install cards.\ntool-find-capability-query = A few English keywords for the missing ability, e.g. "notion", "pdf forms", "github issues"\ntool-skill-read-description = Read the full instructions of an installed skill. Call it before following a skill from the installed skills note.\ntool-skill-read-name = The skill\'s name, as listed in the note\ncapability-found-note = These are candidates; nothing is installed. Show at most 3 with publisher, whether it is verified and what it needs, and also offer a way without installing. The user installs by tapping a card in the app.\ncapability-found-none = Nothing suitable was found. Offer a way to do it without an extension.\ncapability-skills-label = Installed skills (call skill_read with the name before following one)\ncapability-need-input = Needs { $key }: { $description }\ncapability-need-secret = Needs the secret { $key }, kept in the system keychain: { $description }\ncapability-need-remote = Connects to { $host }\ncapability-need-local = Runs { $package } on this computer with { $runtime }\ncapability-need-unverified = The publisher is not verified; only install it if you trust the source\ncapability-need-skill = Adds instructions Xiaoban reads when relevant; it does not run code by itself\ncapability-error-not-found = This extension is no longer in the search results; search again\ncapability-error-risk = This runs code from an unverified publisher on your computer; confirm the risk to install it\ncapability-error-missing = Please fill in: { $keys }\ncapability-error-sign-in = This service needs an account sign-in, which Xiaoban does not support yet\ncapability-error-rejected = The service rejected the key; check it and try again\ncapability-error-runtime = { $runtime } was not found on this computer; install Node.js (for npx) or uv (for uvx) first\ncapability-error-connect = Could not connect to the extension: { $detail }\ncapability-error-search = Could not search for extensions right now\ncapability-error-skill = Could not read a SKILL.md from that address\ncapability-error-unsupported = Xiaoban cannot install this extension\ncapability-error-keychain = Could not save the key to the system keychain\ncapability-error-disabled = This extension is turned off; ask the user to turn it on in settings\nlife-delete = Delete\nfridge-stale-phone = This photo is { $days } days old and some things may be gone. Long-press to remove what\'s missing, or retake it.\nfridge-hint-phone = Long-press an item to change the amount or mark it used up; swipe left to delete\nkitchen-fridge-empty-phone = Tell Xiaoban below what\'s in the fridge, like "eggs, tomatoes, two potatoes".\nkitchen-suggested-phone = From your fridge · all within { $minutes } min\nkitchen-uses-count = Uses { $count } from the fridge\nkitchen-no-buy = Nothing to buy\nkitchen-pick-missing = Missing { $items }, remember to buy\nkitchen-pick-ready = You have everything, start cooking\nkitchen-cart = Add to shopping list\nkitchen-carted = On the list\nkitchen-cook-go = Start cooking\nkitchen-empty-body-phone = Tell Xiaoban below what\'s in the fridge and it suggests three dishes for who\'s eating, what to avoid and how much time you have.\nkitchen-shopping-empty-phone = The shopping list is empty. Pick dishes and tap "Add to shopping list", or say "remember to buy milk" below.\ncook-count = { $n } / { $total }\ncook-prev-step = Previous\ncook-next-step = Next\nweek-tab-menu = Menu\nweek-tab-shopping = Shopping list · { $count }\nweek-swap-short = Swap\nweek-gone-hint = Swipe left on an "In the fridge" row: gone, need to buy\nweek-chat-placeholder = e.g. working late Wednesday, make that a quick one\nledger-budget-none-phone = Set a budget\nledger-row-when = { $day } { $time }\nledger-app-alipay-name = Alipay\nledger-app-wechat-name = WeChat\nledger-import-title-phone = Import bill · { $app } { $count } entries\nledger-empty-say-phone = Say "lunch 38" or "taxi 25" below to record one; import Alipay or WeChat bills on the computer.\nledger-flow-hint-phone = Swipe left on an entry to delete it, tap it to edit\nweather-air-tag = Air { $level } { $value }\nweather-sunset = Sunset { $time }\nweather-hours-swipe = Swipe sideways\nweather-hour-short = { $hour }h\nweather-rules-link = Alerts\nweather-add-short = ＋\nsetup-recommended = { $provider } · Recommended\nsetup-more = More\nsetup-key-local = Your key stays on this phone · Have Xiaoban on a computer? Connect it and your keys come along\nscan-title = Scan to connect\nscan-hint = Point at the QR code in Xiaoban › Settings › Devices on your computer\nscan-manual = Enter the address and code instead\nscan-torch = Flashlight\nscan-found = Found { $name }\nscan-found-unnamed = Found your computer\nscan-connecting = Connecting…\nscan-found-note = At home you use the chats and memories on your computer; your model keys come to the phone too, so it can still chat on its own when you\'re out.\nscan-retry = Scan again\nscan-denied-title = Camera access is needed to scan\nscan-denied-body = Only used to read the QR code. Nothing is recorded or saved.\nscan-open-settings = Open Settings\npair-scan = Scan to connect\npair-scan-lead = On your computer, open Xiaoban › Settings › Devices and scan the QR code with this phone.\npair-or-manual = Can\'t scan? Enter it by hand\nsetup-scan = Scan the code on your computer\nme-connect-computer = Connect your home computer\noperate-working = Xiaoban is working · step { $n }\noperate-press = Tap “{ $label }”\noperate-fill = Fill “{ $label }”\noperate-paused-title = You touched the screen, so Xiaoban stopped\noperate-paused-detail = You\'re in control · stopped at step { $n }\noperate-resume = Let it continue\noperate-end = End\noperate-pause = Pause\noperate-stop = Stop\noperate-handover-title = Payment is up to you\noperate-handover-body = If everything looks right, tap “{ $label }” and pay yourself.\noperate-handover-ok = OK, I\'ll pay\noperate-handover-back = Back to Xiaoban\nconsent-title = Let Xiaoban use this phone for you\nconsent-lead = This needs one system permission: Accessibility (the bar at the top uses it too, no separate overlay permission). Here is what it means first.\nconsent-close = Close\nconsent-bullet = · { $text }\nconsent-use-title = What it is for\nconsent-use-lead = Only while doing a task you gave it, Xiaoban taps and types in other apps. For example:\nconsent-use-1 = Order lunch in a delivery app and stop at the payment page for you\nconsent-use-2 = Fill a grocery cart from your list (you pay)\nconsent-see-title = What it can and cannot see\nconsent-can = Can see\nconsent-can-body = Text and buttons in the current app while a task runs\nconsent-cannot = Never sees or touches\nconsent-cannot-body = Passwords, verification codes, payment pages, banking apps, chats, photos\nconsent-see-note = With no task it reads nothing. It never records the screen; every tap and entry is listed in the chat and the action log.\nconsent-off-title = How to turn it off\nconsent-off-1 = Touch the screen while it works and it stops at once\nconsent-off-2 = Settings › Accessibility › Xiaoban assistant › Off\nconsent-agree = I understand the three points above and let Xiaoban use this permission while doing tasks I give it\nconsent-open = Open system settings\nconsent-later = Not now\nprompt-phone = You are running on the user\'s Android phone, not a computer. Wherever a tool says "this computer" or "app", it means this phone and its apps. When the user mentions an app such as a food delivery or shopping app, find it with find_apps and then operate it for them with look_at_app, click and type_text (the app opens automatically); payment and order-submission steps stop and hand over to the user, so do not press them. Only the back, home and enter keys exist on a phone.\n',
} as const;

export type MessageKey =
  | "agent-task-label"
  | "agents-done"
  | "agents-head"
  | "agents-title"
  | "agents-working"
  | "app-mark"
  | "app-name"
  | "archive-above"
  | "archive-chunk-label"
  | "archive-collapse"
  | "archive-expand"
  | "archive-folded"
  | "archive-loading"
  | "archive-previous-label"
  | "archive-recall-label"
  | "archive-summary"
  | "archive-summary-count"
  | "archive-summary-empty"
  | "archive-summary-foot"
  | "archive-summary-label"
  | "archive-summary-title"
  | "attach-add"
  | "attach-drop"
  | "attach-drop-hint"
  | "attach-read-full"
  | "attach-read-on-demand"
  | "attach-remove"
  | "attach-too-big"
  | "attach-too-many"
  | "attach-unreadable"
  | "attach-vision-deepseek"
  | "attach-vision-mimo"
  | "attach-vision-switch"
  | "attach-vision-text-only"
  | "branch-current"
  | "branch-current-clean"
  | "branch-failed"
  | "branch-menu"
  | "branch-new"
  | "branch-new-placeholder"
  | "branch-pull"
  | "branch-remote"
  | "branch-remote-behind"
  | "branch-restore"
  | "branch-search"
  | "branch-stashed"
  | "branch-switch-body"
  | "branch-switch-carry"
  | "branch-switch-commit"
  | "branch-switch-hint"
  | "branch-switch-stash"
  | "branch-switch-title"
  | "capability-error-connect"
  | "capability-error-disabled"
  | "capability-error-keychain"
  | "capability-error-missing"
  | "capability-error-not-found"
  | "capability-error-rejected"
  | "capability-error-risk"
  | "capability-error-runtime"
  | "capability-error-search"
  | "capability-error-sign-in"
  | "capability-error-skill"
  | "capability-error-unsupported"
  | "capability-found-none"
  | "capability-found-note"
  | "capability-need-input"
  | "capability-need-local"
  | "capability-need-remote"
  | "capability-need-secret"
  | "capability-need-skill"
  | "capability-need-unverified"
  | "capability-skills-label"
  | "chat-back"
  | "chat-confirm-band"
  | "chat-delete"
  | "chat-more"
  | "chat-placeholder"
  | "chat-sub-primary"
  | "chat-subtitle-lead"
  | "chat-subtitle-primary"
  | "chats-all"
  | "chats-confirm"
  | "chats-primary-empty"
  | "chats-running"
  | "chats-search"
  | "chats-search-placeholder"
  | "chats-tag-confirm"
  | "chats-tag-plan"
  | "chats-tag-running"
  | "code-add-input"
  | "code-added"
  | "code-binary"
  | "code-branch-changes"
  | "code-card-revert-all"
  | "code-card-reverted"
  | "code-card-title"
  | "code-card-view"
  | "code-changed-count"
  | "code-changes-head"
  | "code-close-tab"
  | "code-copy"
  | "code-copy-path"
  | "code-deleted-file"
  | "code-diff-split"
  | "code-diff-unified"
  | "code-file-binary"
  | "code-file-changed"
  | "code-file-truncated"
  | "code-files"
  | "code-files-collapse"
  | "code-files-expand"
  | "code-files-search"
  | "code-hunk-near"
  | "code-image-failed"
  | "code-image-hint"
  | "code-image-size"
  | "code-look"
  | "code-look-text"
  | "code-mark-added"
  | "code-mark-changed"
  | "code-new-file"
  | "code-no-changes"
  | "code-open"
  | "code-open-editor"
  | "code-panel"
  | "code-preview"
  | "code-quote"
  | "code-removed"
  | "code-resize"
  | "code-resize-width"
  | "code-restore"
  | "code-revert-file"
  | "code-revert-hunk"
  | "code-seconds"
  | "code-see-changes"
  | "code-source"
  | "code-status-ahead"
  | "code-status-clean"
  | "code-status-no-git"
  | "code-status-uncommitted"
  | "code-tab-changes"
  | "code-tab-git"
  | "code-tab-terminal"
  | "code-terminal-agent"
  | "code-terminal-empty"
  | "code-terminal-failed"
  | "code-terminal-input"
  | "code-terminal-input-busy"
  | "code-terminal-ok"
  | "code-terminal-queued"
  | "code-terminal-running-for"
  | "code-terminal-stop"
  | "code-terminal-stopped"
  | "code-terminal-you"
  | "code-undone-block"
  | "code-undone-file"
  | "code-view"
  | "command-pill-declined"
  | "command-pill-failed"
  | "command-pill-ok"
  | "command-pill-timeout"
  | "commit-draft-diff"
  | "commit-draft-files"
  | "commit-draft-recent"
  | "commit-drafting"
  | "commit-hint"
  | "commit-message"
  | "commit-only"
  | "commit-placeholder"
  | "commit-push"
  | "commit-redraft"
  | "commit-title"
  | "composer-cancel-words"
  | "composer-label"
  | "composer-placeholder"
  | "composer-placeholder-busy"
  | "composer-queued"
  | "composer-send"
  | "composer-stop"
  | "confirm-action-edit"
  | "confirm-action-hint"
  | "confirm-action-no"
  | "confirm-action-yes"
  | "confirm-allow-always"
  | "confirm-allow-hint"
  | "confirm-allow-no"
  | "confirm-allow-once"
  | "confirm-allow-title"
  | "confirm-mouse-always"
  | "confirm-mouse-hint"
  | "confirm-mouse-no"
  | "confirm-mouse-once"
  | "confirm-mouse-title"
  | "confirm-permissions-hint"
  | "confirm-permissions-title"
  | "confirm-read-always"
  | "confirm-read-title"
  | "confirm-run-always"
  | "confirm-run-cwd"
  | "confirm-run-no"
  | "confirm-run-once"
  | "confirm-run-title"
  | "confirm-subthreads-edit"
  | "confirm-subthreads-hint"
  | "confirm-subthreads-item"
  | "confirm-subthreads-no"
  | "confirm-subthreads-title"
  | "confirm-subthreads-yes"
  | "confirm-write-always"
  | "confirm-write-title"
  | "conflict-abort"
  | "conflict-abort-body"
  | "conflict-abort-title"
  | "conflict-all-done"
  | "conflict-ask"
  | "conflict-ask-text"
  | "conflict-banner"
  | "conflict-bar"
  | "conflict-bar-done"
  | "conflict-count"
  | "conflict-editor"
  | "conflict-finish"
  | "conflict-incoming"
  | "conflict-left"
  | "conflict-mark"
  | "conflict-none-left"
  | "conflict-number"
  | "conflict-ours"
  | "conflict-tab"
  | "conflict-theirs"
  | "conflict-use-both"
  | "conflict-use-ours"
  | "conflict-use-theirs"
  | "conflict-where"
  | "connection-closed"
  | "connection-connecting"
  | "connection-idle"
  | "connection-open"
  | "connection-reconnecting"
  | "connection-waiting-for-hub"
  | "consent-agree"
  | "consent-bullet"
  | "consent-can"
  | "consent-can-body"
  | "consent-cannot"
  | "consent-cannot-body"
  | "consent-close"
  | "consent-later"
  | "consent-lead"
  | "consent-off-1"
  | "consent-off-2"
  | "consent-off-title"
  | "consent-open"
  | "consent-see-note"
  | "consent-see-title"
  | "consent-title"
  | "consent-use-1"
  | "consent-use-2"
  | "consent-use-lead"
  | "consent-use-title"
  | "context-amount"
  | "context-auto"
  | "context-auto-note"
  | "context-auto-off"
  | "context-compact"
  | "context-compact-failed"
  | "context-compact-note"
  | "context-compact-short"
  | "context-compacted"
  | "context-compacting"
  | "context-compacting-hint"
  | "context-compacting-pill"
  | "context-help"
  | "context-title"
  | "context-trigger"
  | "cook-ask-placeholder"
  | "cook-back"
  | "cook-check"
  | "cook-count"
  | "cook-done"
  | "cook-finished-message"
  | "cook-meta"
  | "cook-next"
  | "cook-next-step"
  | "cook-planning"
  | "cook-prev"
  | "cook-prev-step"
  | "cook-progress"
  | "cook-start-timer"
  | "cook-step-n"
  | "cook-steps-head"
  | "cook-talk"
  | "cook-timer-label"
  | "cook-timer-running"
  | "cook-timing"
  | "cook-title"
  | "cook-you-asked"
  | "custom-api-anthropic"
  | "custom-api-anthropic-hint"
  | "custom-api-label"
  | "custom-api-open_ai"
  | "custom-api-open_ai-hint"
  | "custom-api-responses"
  | "custom-api-responses-hint"
  | "custom-base-url-hint"
  | "custom-base-url-label"
  | "custom-base-url-placeholder"
  | "custom-card-hint"
  | "custom-description"
  | "custom-label-label"
  | "custom-label-placeholder"
  | "custom-model-label"
  | "custom-model-placeholder"
  | "custom-trust-warning"
  | "daily-afternoon"
  | "daily-arrange"
  | "daily-arrange-done"
  | "daily-arrange-hint"
  | "daily-card-confirm"
  | "daily-confirm"
  | "daily-dot"
  | "daily-drag"
  | "daily-drop-here"
  | "daily-evening"
  | "daily-food"
  | "daily-food-empty"
  | "daily-food-start"
  | "daily-hello-name"
  | "daily-hidden"
  | "daily-hidden-none"
  | "daily-hide"
  | "daily-money"
  | "daily-money-budget"
  | "daily-money-empty"
  | "daily-more-body"
  | "daily-more-title"
  | "daily-morning"
  | "daily-narrow"
  | "daily-open-kitchen"
  | "daily-open-ledger"
  | "daily-open-weather"
  | "daily-plans"
  | "daily-plans-count"
  | "daily-plans-empty"
  | "daily-reset"
  | "daily-shopping"
  | "daily-show"
  | "daily-size"
  | "daily-talk"
  | "daily-wide"
  | "delete-thread-body"
  | "delete-thread-confirm"
  | "delete-thread-title"
  | "delivered"
  | "device-android"
  | "device-desktop"
  | "device-ios"
  | "dialog-cancel"
  | "dialog-close"
  | "doc-act-ask"
  | "doc-act-ask-more"
  | "doc-act-ask-placeholder"
  | "doc-act-example"
  | "doc-act-longer"
  | "doc-act-plain"
  | "doc-act-shorter"
  | "doc-act-tone"
  | "doc-another"
  | "doc-another-button"
  | "doc-ask-action"
  | "doc-ask-question"
  | "doc-back"
  | "doc-chat-hint"
  | "doc-chat-note"
  | "doc-chat-placeholder"
  | "doc-compare"
  | "doc-compare-exit"
  | "doc-comparing"
  | "doc-context-label"
  | "doc-export"
  | "doc-export-note"
  | "doc-export-pdf"
  | "doc-export-word"
  | "doc-format-copy"
  | "doc-format-md"
  | "doc-format-pdf"
  | "doc-format-word"
  | "doc-icon"
  | "doc-keep-original"
  | "doc-mark-keep"
  | "doc-mark-undo"
  | "doc-marks-count"
  | "doc-marks-keep-all"
  | "doc-marks-undo-all"
  | "doc-meta"
  | "doc-more-sections"
  | "doc-open"
  | "doc-open-word"
  | "doc-outline"
  | "doc-outline-hint"
  | "doc-restore"
  | "doc-saved"
  | "doc-selected-body"
  | "doc-selected-label"
  | "doc-suggestion-head"
  | "doc-tone-formal"
  | "doc-tone-simple"
  | "doc-tone-warm"
  | "doc-use"
  | "doc-version"
  | "doc-version-first"
  | "doc-version-name"
  | "doc-version-restored"
  | "doc-version-user"
  | "doc-watch"
  | "doc-writing"
  | "draft-background"
  | "draft-background-running"
  | "draft-background-untitled"
  | "draft-elapsed"
  | "draft-failed"
  | "draft-failed-retry"
  | "draft-long-wait"
  | "draft-stopped"
  | "draft-thinking"
  | "draft-unreachable"
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
  | "failure-invalid-endpoint"
  | "failure-invalid-key"
  | "failure-model"
  | "failure-network"
  | "failure-not-configured"
  | "failure-unknown-model"
  | "failure-unknown-model-listed"
  | "file-look-again"
  | "file-menu-copy"
  | "file-menu-look-again"
  | "file-menu-open"
  | "file-menu-reveal-mac"
  | "file-menu-reveal-windows"
  | "file-menu-save-as"
  | "file-note-full"
  | "file-note-image"
  | "file-note-on-demand"
  | "file-note-outline"
  | "file-note-preview"
  | "file-note-unreadable"
  | "file-open-hint"
  | "file-open-label"
  | "fridge-amount-placeholder"
  | "fridge-edit-hint"
  | "fridge-hint"
  | "fridge-hint-phone"
  | "fridge-left"
  | "fridge-remove"
  | "fridge-stale"
  | "fridge-stale-phone"
  | "fridge-used-up"
  | "fridge-used-up-shop"
  | "git-ahead"
  | "git-all-branches"
  | "git-commit"
  | "git-commit-meta"
  | "git-commit-open"
  | "git-copy-hash"
  | "git-explain"
  | "git-explain-text"
  | "git-init"
  | "git-not-repo"
  | "git-not-repo-hint"
  | "git-pr"
  | "git-pr-opening"
  | "git-this-branch"
  | "git-working"
  | "git-working-files"
  | "heat-high"
  | "heat-low"
  | "heat-medium"
  | "heat-none"
  | "home-context-label"
  | "home-greeting"
  | "home-greeting-named"
  | "home-greeting-suggest"
  | "home-suggestion-expense"
  | "home-suggestion-umbrella"
  | "home-suggestion-weekend"
  | "hub-default-name"
  | "image-menu-copy"
  | "image-menu-download"
  | "image-menu-preview-mac"
  | "image-menu-preview-windows"
  | "image-menu-zoom"
  | "island-collapse"
  | "island-done"
  | "island-done-reply"
  | "island-hint"
  | "island-menu-expand"
  | "island-menu-home"
  | "island-menu-quit"
  | "island-menu-settings"
  | "island-menu-snooze"
  | "island-note-label"
  | "island-note-placeholder"
  | "island-open"
  | "island-open-main"
  | "island-pause"
  | "island-paused"
  | "island-resume"
  | "island-step-count"
  | "island-step-line"
  | "island-stop"
  | "island-title"
  | "island-title-app"
  | "island-title-app-background"
  | "keep-chilled"
  | "keep-frozen"
  | "keep-room"
  | "kitchen-add-missing"
  | "kitchen-add-photo"
  | "kitchen-another"
  | "kitchen-another-batch"
  | "kitchen-ask"
  | "kitchen-ask-tonight"
  | "kitchen-avoid"
  | "kitchen-back"
  | "kitchen-cart"
  | "kitchen-carted"
  | "kitchen-chat"
  | "kitchen-chat-hint"
  | "kitchen-chat-note"
  | "kitchen-chat-placeholder"
  | "kitchen-clear-bought"
  | "kitchen-context-label"
  | "kitchen-cook-go"
  | "kitchen-empty-body"
  | "kitchen-empty-body-phone"
  | "kitchen-empty-title"
  | "kitchen-fridge"
  | "kitchen-fridge-empty"
  | "kitchen-fridge-empty-phone"
  | "kitchen-have-all"
  | "kitchen-item"
  | "kitchen-joiner"
  | "kitchen-listening"
  | "kitchen-minutes"
  | "kitchen-missing"
  | "kitchen-no-buy"
  | "kitchen-photo-empty"
  | "kitchen-photo-filter"
  | "kitchen-photo-message"
  | "kitchen-photo-when"
  | "kitchen-pick-missing"
  | "kitchen-pick-ready"
  | "kitchen-plus"
  | "kitchen-resume-cook"
  | "kitchen-retake"
  | "kitchen-rules"
  | "kitchen-rules-hint"
  | "kitchen-servings"
  | "kitchen-servings-unknown"
  | "kitchen-shopping-empty"
  | "kitchen-shopping-empty-phone"
  | "kitchen-shopping-left"
  | "kitchen-start"
  | "kitchen-start-button"
  | "kitchen-suggested"
  | "kitchen-suggested-note"
  | "kitchen-suggested-phone"
  | "kitchen-summary"
  | "kitchen-summary-all"
  | "kitchen-summary-missing"
  | "kitchen-tab-shopping"
  | "kitchen-tab-tonight"
  | "kitchen-tab-week"
  | "kitchen-thinking"
  | "kitchen-thread-title"
  | "kitchen-title"
  | "kitchen-used-hint"
  | "kitchen-uses"
  | "kitchen-uses-count"
  | "kitchen-within"
  | "ledger-all"
  | "ledger-app-alipay"
  | "ledger-app-alipay-name"
  | "ledger-app-wechat"
  | "ledger-app-wechat-name"
  | "ledger-bill-filter"
  | "ledger-budget"
  | "ledger-budget-edit"
  | "ledger-budget-label"
  | "ledger-budget-none-phone"
  | "ledger-budget-set"
  | "ledger-by-category"
  | "ledger-cancel"
  | "ledger-cat-clothes"
  | "ledger-cat-dining"
  | "ledger-cat-fun"
  | "ledger-cat-gifts"
  | "ledger-cat-health"
  | "ledger-cat-household"
  | "ledger-cat-housing"
  | "ledger-cat-kids"
  | "ledger-cat-other"
  | "ledger-cat-transport"
  | "ledger-chat-hint"
  | "ledger-chat-note"
  | "ledger-chat-placeholder"
  | "ledger-context-label"
  | "ledger-delete"
  | "ledger-edit"
  | "ledger-edit-amount"
  | "ledger-edit-category"
  | "ledger-edit-name"
  | "ledger-empty-bill"
  | "ledger-empty-body"
  | "ledger-empty-budget"
  | "ledger-empty-import"
  | "ledger-empty-receipt"
  | "ledger-empty-say"
  | "ledger-empty-say-phone"
  | "ledger-empty-title"
  | "ledger-filter-hint"
  | "ledger-filter-on"
  | "ledger-flow-empty"
  | "ledger-flow-head"
  | "ledger-flow-head-range"
  | "ledger-flow-hint"
  | "ledger-flow-hint-phone"
  | "ledger-import"
  | "ledger-import-commit"
  | "ledger-import-failed"
  | "ledger-import-label"
  | "ledger-import-message"
  | "ledger-import-meta"
  | "ledger-import-note"
  | "ledger-import-sorting"
  | "ledger-import-summary"
  | "ledger-import-title-phone"
  | "ledger-left"
  | "ledger-month-none"
  | "ledger-month-short"
  | "ledger-mute"
  | "ledger-next"
  | "ledger-next-month"
  | "ledger-next-range"
  | "ledger-next-year"
  | "ledger-no-budget"
  | "ledger-noticed"
  | "ledger-noticed-up"
  | "ledger-open-week"
  | "ledger-other"
  | "ledger-over"
  | "ledger-pace-even"
  | "ledger-pace-over"
  | "ledger-pace-save"
  | "ledger-past-left"
  | "ledger-past-over"
  | "ledger-picker"
  | "ledger-picker-label"
  | "ledger-picker-month"
  | "ledger-picker-month-hint"
  | "ledger-picker-range"
  | "ledger-picker-range-hint"
  | "ledger-picker-range-note"
  | "ledger-preset-30"
  | "ledger-preset-7"
  | "ledger-preset-last-week"
  | "ledger-preset-week"
  | "ledger-preset-year"
  | "ledger-prev"
  | "ledger-prev-month"
  | "ledger-prev-range"
  | "ledger-prev-year"
  | "ledger-range-count"
  | "ledger-range-daily"
  | "ledger-range-days"
  | "ledger-range-go"
  | "ledger-range-less"
  | "ledger-range-more"
  | "ledger-range-spent"
  | "ledger-receipt-message"
  | "ledger-row-when"
  | "ledger-save"
  | "ledger-search"
  | "ledger-source-import"
  | "ledger-source-receipt"
  | "ledger-source-said"
  | "ledger-spent"
  | "ledger-status-duplicate"
  | "ledger-status-income"
  | "ledger-status-new"
  | "ledger-status-refund"
  | "ledger-status-transfer"
  | "ledger-this-month"
  | "ledger-thread-title"
  | "ledger-title"
  | "ledger-today"
  | "ledger-year"
  | "ledger-yesterday"
  | "life-delete"
  | "location-place"
  | "look-up-message"
  | "looking-elapsed"
  | "looking-slow"
  | "looking-stop"
  | "looking-title"
  | "md-alert-caution"
  | "md-alert-important"
  | "md-alert-note"
  | "md-alert-tip"
  | "md-alert-warning"
  | "me-autonomy"
  | "me-autonomy-current"
  | "me-computer"
  | "me-computer-online"
  | "me-connect-computer"
  | "me-connected"
  | "me-days"
  | "me-forget"
  | "me-memories"
  | "me-memories-count"
  | "me-memories-hint"
  | "me-unpair"
  | "me-unpair-body"
  | "me-unpair-title"
  | "me-you"
  | "meet-all-set"
  | "meet-failed"
  | "meet-heading"
  | "meet-input-placeholder"
  | "meet-intro"
  | "meet-lead"
  | "meet-locating"
  | "meet-location-guess"
  | "meet-location-missing"
  | "meet-location-note"
  | "meet-progress"
  | "meet-question-home-and-work"
  | "meet-question-household"
  | "meet-question-preferred-name"
  | "meet-reading"
  | "meet-remembered"
  | "meet-reply-alone"
  | "meet-reply-guess-right"
  | "meet-reply-guess-wrong"
  | "meet-reply-pass"
  | "meet-unclear"
  | "memory-card-aliases"
  | "memory-card-constraint"
  | "memory-card-edit"
  | "memory-card-edit-prompt"
  | "memory-card-forget"
  | "memory-card-meta"
  | "memory-card-pin"
  | "memory-card-pinned"
  | "memory-card-separator"
  | "memory-card-unpin"
  | "memory-category-family"
  | "memory-category-food"
  | "memory-category-home_work"
  | "memory-category-likes"
  | "memory-category-other"
  | "memory-category-plans"
  | "memory-graph-count"
  | "memory-graph-few"
  | "memory-graph-glowing"
  | "memory-graph-legend"
  | "memory-graph-recent"
  | "memory-graph-tip"
  | "memory-graph-used-title"
  | "memory-recall-label"
  | "memory-saved-chip"
  | "memory-sky-all"
  | "memory-sky-count"
  | "memory-sky-crumb-separator"
  | "memory-sky-crumbs"
  | "memory-sky-expand"
  | "memory-sky-hint"
  | "memory-sky-label"
  | "memory-sky-loose"
  | "memory-sky-search"
  | "memory-sky-search-placeholder"
  | "memory-sky-summary"
  | "memory-sky-title"
  | "memory-topic-home-and-work"
  | "memory-topic-household"
  | "memory-topic-preferred-name"
  | "menu-copy"
  | "menu-cut"
  | "menu-delete-thread"
  | "menu-key-space"
  | "menu-look-up"
  | "menu-mark-unread"
  | "menu-new-thread-with"
  | "menu-open"
  | "menu-paste"
  | "menu-quote"
  | "menu-quote-selection"
  | "menu-read-aloud"
  | "menu-regenerate"
  | "menu-regenerate-last-only"
  | "menu-rename"
  | "menu-select-all"
  | "menu-stop-reading"
  | "menu-voice"
  | "model-add"
  | "model-current"
  | "model-heading"
  | "model-lead"
  | "model-not-connected"
  | "model-switch-failed"
  | "model-switching"
  | "nav-chat"
  | "nav-daily"
  | "nav-main"
  | "nav-me"
  | "nav-skills"
  | "nav-soon"
  | "now-context-label"
  | "onboarding-back"
  | "onboarding-checking"
  | "onboarding-cost-note"
  | "onboarding-finish"
  | "onboarding-get-key"
  | "onboarding-hello"
  | "onboarding-hide-key"
  | "onboarding-intro"
  | "onboarding-key-label"
  | "onboarding-key-local"
  | "onboarding-key-placeholder"
  | "onboarding-later"
  | "onboarding-local-first"
  | "onboarding-next"
  | "onboarding-pick-provider"
  | "onboarding-privacy"
  | "onboarding-progress"
  | "onboarding-recommended"
  | "onboarding-show-key"
  | "onboarding-skip"
  | "onboarding-submit"
  | "operate-consent-control"
  | "operate-consent-control-body"
  | "operate-consent-later"
  | "operate-consent-lead"
  | "operate-consent-limits"
  | "operate-consent-limits-body"
  | "operate-consent-open"
  | "operate-consent-permissions"
  | "operate-consent-stop"
  | "operate-consent-stop-body"
  | "operate-consent-title"
  | "operate-consent-what"
  | "operate-consent-what-body"
  | "operate-end"
  | "operate-fill"
  | "operate-handover-back"
  | "operate-handover-body"
  | "operate-handover-ok"
  | "operate-handover-title"
  | "operate-pause"
  | "operate-paused-detail"
  | "operate-paused-title"
  | "operate-press"
  | "operate-resume"
  | "operate-stop"
  | "operate-working"
  | "overlay-click"
  | "overlay-click-real"
  | "overlay-type"
  | "overlay-type-real"
  | "overlay-unnamed"
  | "pair-address-placeholder"
  | "pair-code-placeholder"
  | "pair-hello"
  | "pair-home-lead"
  | "pair-lead"
  | "pair-or-manual"
  | "pair-scan"
  | "pair-scan-lead"
  | "pair-submit"
  | "pair-submitting"
  | "pair-title"
  | "pairing-dialog-title"
  | "panel-list-hide"
  | "panel-list-shortcut"
  | "panel-list-show"
  | "panel-workspace-hide"
  | "panel-workspace-shortcut"
  | "panel-workspace-show"
  | "phone-address-label"
  | "phone-code-expired"
  | "phone-code-label"
  | "phone-connected"
  | "phone-heading"
  | "phone-lead"
  | "phone-no-network"
  | "phone-qr-label"
  | "phone-refresh"
  | "phone-relay-hint"
  | "phone-step-install"
  | "phone-step-scan"
  | "phone-step-wifi"
  | "phone-waiting"
  | "place-ask"
  | "place-ask-message"
  | "place-checked"
  | "place-checked-old"
  | "place-close"
  | "place-duration"
  | "place-empty"
  | "place-meta"
  | "place-photos"
  | "place-quiet"
  | "place-remove"
  | "place-remove-message"
  | "place-replace"
  | "place-replace-message"
  | "place-review"
  | "place-review-source"
  | "place-reviews"
  | "place-source"
  | "place-suits"
  | "place-tickets"
  | "place-unverified"
  | "place-why"
  | "plan-adjusted"
  | "plan-approve"
  | "plan-approved"
  | "plan-blocked-title"
  | "plan-bounds"
  | "plan-chosen"
  | "plan-collapse"
  | "plan-context-label"
  | "plan-continue"
  | "plan-dismiss"
  | "plan-dock"
  | "plan-draft-hint"
  | "plan-draft-tag"
  | "plan-expand"
  | "plan-output-deck"
  | "plan-output-doc"
  | "plan-output-prefixes"
  | "plan-output-sheet"
  | "plan-output-text"
  | "plan-pause"
  | "plan-reply"
  | "plan-resume"
  | "plan-resumed"
  | "plan-ring"
  | "plan-step-doing"
  | "plan-step-done"
  | "plan-stuck"
  | "plan-sub-blocked"
  | "plan-sub-doing"
  | "plan-sub-done"
  | "plan-sub-draft"
  | "plan-sub-paused"
  | "plan-undock"
  | "prep-due-title"
  | "prompt-archive"
  | "prompt-capability-policy"
  | "prompt-commit-message"
  | "prompt-doc"
  | "prompt-interpret-answer"
  | "prompt-kitchen"
  | "prompt-ledger"
  | "prompt-memory-galaxies"
  | "prompt-memory-heading"
  | "prompt-memory-policy"
  | "prompt-memory-tidy"
  | "prompt-phone"
  | "prompt-sheet"
  | "prompt-slides"
  | "prompt-system"
  | "prompt-thinking-pick"
  | "prompt-thread-title"
  | "prompt-tool-policy"
  | "prompt-workspace"
  | "provider-custom"
  | "provider-deepseek"
  | "provider-mimo"
  | "quote-collapse"
  | "quote-context-label"
  | "quote-expand"
  | "quote-from-assistant"
  | "quote-from-user"
  | "quote-gone"
  | "quote-image"
  | "quote-label"
  | "quote-remove"
  | "quote-table"
  | "reasoning-hide"
  | "reasoning-show"
  | "reasoning-thinking"
  | "reasoning-thought"
  | "ref-ask-failure"
  | "ref-checks-failed"
  | "ref-checks-passed"
  | "ref-checks-pending"
  | "ref-closed"
  | "ref-comments"
  | "ref-draft"
  | "ref-files"
  | "ref-issue-label"
  | "ref-issue-where"
  | "ref-look-failure"
  | "ref-merged"
  | "ref-more-checks"
  | "ref-number"
  | "ref-open"
  | "ref-open-browser"
  | "ref-pin"
  | "ref-pins-less"
  | "ref-pins-more"
  | "ref-pr-label"
  | "ref-pr-where"
  | "ref-table-headers"
  | "ref-unpin"
  | "reply-meta"
  | "reply-thought"
  | "reply-thought-effort"
  | "reply-time"
  | "rich-copied"
  | "rich-copy"
  | "rich-footnote-back"
  | "rich-footnotes"
  | "rich-image-copy-link"
  | "rich-image-failed"
  | "rich-image-open"
  | "scan-connecting"
  | "scan-denied-body"
  | "scan-denied-title"
  | "scan-found"
  | "scan-found-note"
  | "scan-found-unnamed"
  | "scan-hint"
  | "scan-manual"
  | "scan-open-settings"
  | "scan-retry"
  | "scan-title"
  | "scan-torch"
  | "search-card-connected"
  | "search-card-invalid"
  | "search-card-key"
  | "search-card-keychain"
  | "search-card-offline"
  | "search-card-placeholder"
  | "search-card-platform"
  | "search-card-resuming"
  | "search-card-save"
  | "search-card-skip"
  | "search-card-skipped"
  | "search-card-skipped-hint"
  | "search-card-step-1"
  | "search-card-step-2"
  | "search-card-subtitle"
  | "search-card-title"
  | "search-card-verifying"
  | "search-label"
  | "search-placeholder"
  | "service-declined-search"
  | "service-resume-search"
  | "setup-key-local"
  | "setup-more"
  | "setup-recommended"
  | "setup-scan"
  | "sheet-ask-range"
  | "sheet-chart"
  | "sheet-chart-bar"
  | "sheet-chart-line"
  | "sheet-chart-pie"
  | "sheet-chart-remove"
  | "sheet-chat-hint"
  | "sheet-chat-note"
  | "sheet-chat-placeholder"
  | "sheet-col-delete"
  | "sheet-col-left"
  | "sheet-col-right"
  | "sheet-computed"
  | "sheet-context-label"
  | "sheet-draw"
  | "sheet-export-csv"
  | "sheet-export-excel"
  | "sheet-export-note"
  | "sheet-format-copy"
  | "sheet-format-csv"
  | "sheet-format-xlsx"
  | "sheet-formula"
  | "sheet-icon"
  | "sheet-lowest"
  | "sheet-mark-lowest"
  | "sheet-marks-count"
  | "sheet-meta"
  | "sheet-more-rows"
  | "sheet-open-excel"
  | "sheet-open-in-xiaoban"
  | "sheet-row-above"
  | "sheet-row-below"
  | "sheet-row-delete"
  | "sheet-saved"
  | "sheet-sort"
  | "sheet-sort-asc"
  | "sheet-sort-desc"
  | "sheet-status-avg"
  | "sheet-status-count"
  | "sheet-status-hint"
  | "sheet-status-min"
  | "sheet-status-sum"
  | "sheet-tab-add"
  | "sheet-tab-delete"
  | "sheet-tab-new"
  | "sheet-tab-plus"
  | "sheet-tab-rename"
  | "sheet-version-first"
  | "sheet-version-imported"
  | "skills-can-do"
  | "skills-code"
  | "skills-code-example"
  | "skills-cook"
  | "skills-cook-example"
  | "skills-doc"
  | "skills-doc-example"
  | "skills-ledger"
  | "skills-ledger-example"
  | "skills-operate"
  | "skills-operate-example"
  | "skills-plan"
  | "skills-plan-example"
  | "skills-quote"
  | "skills-scene-computer"
  | "skills-scene-cook"
  | "skills-scene-docs"
  | "skills-scene-life"
  | "skills-scene-trip"
  | "skills-search"
  | "skills-sheet"
  | "skills-sheet-example"
  | "skills-slides"
  | "skills-slides-example"
  | "skills-tonight"
  | "skills-tonight-example"
  | "skills-tray"
  | "skills-tray-cancel"
  | "skills-tray-send"
  | "skills-trip"
  | "skills-trip-change"
  | "skills-trip-change-example"
  | "skills-trip-example"
  | "skills-try"
  | "skills-weather"
  | "skills-weather-example"
  | "skills-week"
  | "skills-week-example"
  | "slides-act-reword"
  | "slides-act-shorter"
  | "slides-add"
  | "slides-ask-page"
  | "slides-change-head"
  | "slides-change-new"
  | "slides-chart-bar"
  | "slides-chart-line"
  | "slides-chart-pie"
  | "slides-chat-hint"
  | "slides-chat-note"
  | "slides-chat-placeholder"
  | "slides-context-label"
  | "slides-delete"
  | "slides-duplicate"
  | "slides-edit-body-hint"
  | "slides-edit-hint"
  | "slides-empty"
  | "slides-export-note"
  | "slides-export-pdf"
  | "slides-export-pptx"
  | "slides-format-pdf"
  | "slides-format-png"
  | "slides-format-pptx"
  | "slides-highest"
  | "slides-icon"
  | "slides-image-add"
  | "slides-image-change"
  | "slides-image-note"
  | "slides-image-placeholder"
  | "slides-image-remove"
  | "slides-image-search"
  | "slides-keep"
  | "slides-last-page"
  | "slides-layout"
  | "slides-layout-bullets"
  | "slides-layout-chart"
  | "slides-layout-compare"
  | "slides-layout-flow"
  | "slides-layout-funnel"
  | "slides-layout-icons"
  | "slides-layout-number"
  | "slides-layout-quote"
  | "slides-layout-section"
  | "slides-layout-timeline"
  | "slides-layout-title"
  | "slides-layout-two"
  | "slides-meta"
  | "slides-new-point"
  | "slides-new-title"
  | "slides-next"
  | "slides-next-page"
  | "slides-no-notes"
  | "slides-notes"
  | "slides-notes-placeholder"
  | "slides-open-powerpoint"
  | "slides-pages"
  | "slides-part-body"
  | "slides-part-chart"
  | "slides-part-image"
  | "slides-part-subtitle"
  | "slides-part-title"
  | "slides-present"
  | "slides-present-keys"
  | "slides-present-progress"
  | "slides-reword"
  | "slides-theme-blue"
  | "slides-theme-green"
  | "slides-theme-night"
  | "slides-theme-note"
  | "slides-theme-orange"
  | "slides-top-meta"
  | "slides-transition"
  | "slides-transition-fade"
  | "slides-transition-none"
  | "slides-transition-push"
  | "slides-transition-zoom"
  | "slides-undo"
  | "slides-undo-new"
  | "slides-version-first"
  | "slides-versions-hint"
  | "slides-writing"
  | "step-click"
  | "step-click-plain"
  | "step-confirm"
  | "step-confirm-plain"
  | "step-declined"
  | "step-do_steps"
  | "step-do_steps-plain"
  | "step-edit_file"
  | "step-edit_file-plain"
  | "step-failed"
  | "step-failed-page"
  | "step-find_apps"
  | "step-find_apps-plain"
  | "step-find_threads"
  | "step-find_threads-plain"
  | "step-forget"
  | "step-forget-plain"
  | "step-found"
  | "step-found-plain"
  | "step-generic"
  | "step-gh"
  | "step-gh-plain"
  | "step-git"
  | "step-git-plain"
  | "step-history_outline"
  | "step-history_read"
  | "step-history_search"
  | "step-history_search-plain"
  | "step-list_dir"
  | "step-list_dir-plain"
  | "step-list_threads"
  | "step-locate"
  | "step-look_at_app"
  | "step-look_at_app-plain"
  | "step-matched"
  | "step-matched-none"
  | "step-meet-hint"
  | "step-meet-title"
  | "step-message_subthread"
  | "step-model-hint"
  | "step-model-title"
  | "step-open_app"
  | "step-open_app-plain"
  | "step-open_subthreads"
  | "step-phone-hint"
  | "step-phone-title"
  | "step-press_keys"
  | "step-press_keys-plain"
  | "step-ran-failed"
  | "step-ran-ok"
  | "step-ran-timeout"
  | "step-read_file"
  | "step-read_file-plain"
  | "step-read_page"
  | "step-read_page-plain"
  | "step-read_thread"
  | "step-recall"
  | "step-recall-plain"
  | "step-remember"
  | "step-remember-plain"
  | "step-run_command"
  | "step-run_command-plain"
  | "step-save_place_detail"
  | "step-save_place_detail-plain"
  | "step-save_trip"
  | "step-saved"
  | "step-search_files"
  | "step-search_files-plain"
  | "step-sources-joiner"
  | "step-spawn_agents"
  | "step-thinking"
  | "step-trust-hint"
  | "step-trust-title"
  | "step-type_text"
  | "step-type_text-plain"
  | "step-weather"
  | "step-weather-plain"
  | "step-web_search"
  | "step-web_search-plain"
  | "step-write_file"
  | "step-write_file-plain"
  | "subthread-cards-hint"
  | "subthread-open-arrow"
  | "subthread-report-label"
  | "subthread-report-rules"
  | "subthread-report-title"
  | "subthread-task-label"
  | "subthread-task-rules"
  | "tab-chats"
  | "tab-daily"
  | "tab-me"
  | "tab-skills"
  | "thinking-auto"
  | "thinking-auto-help"
  | "thinking-high"
  | "thinking-high-help"
  | "thinking-low"
  | "thinking-low-help"
  | "thinking-max"
  | "thinking-max-help"
  | "thinking-model"
  | "thinking-none"
  | "thinking-none-help"
  | "thinking-title"
  | "thinking-unsupported"
  | "thread-empty"
  | "thread-list-hint"
  | "thread-menu-compact"
  | "thread-new"
  | "thread-new-shortcut"
  | "thread-ref-hint"
  | "thread-ref-pick"
  | "thread-ref-remove"
  | "thread-ref-title"
  | "thread-reference-label"
  | "thread-section-other"
  | "thread-status-done"
  | "thread-status-need"
  | "thread-status-running"
  | "thread-unread"
  | "thread-untitled"
  | "time-just-now"
  | "time-yesterday"
  | "timer-add"
  | "timer-default-label"
  | "timer-done"
  | "timer-done-banner"
  | "timer-done-body"
  | "timer-done-title"
  | "timer-extend"
  | "timer-head"
  | "timer-hint"
  | "timer-label"
  | "timer-minutes"
  | "timer-ok"
  | "timer-start-short"
  | "timer-then"
  | "tool-agent-task"
  | "tool-agent-title"
  | "tool-click-description"
  | "tool-code-path"
  | "tool-confirm-description"
  | "tool-confirm-detail"
  | "tool-confirm-title"
  | "tool-cook-dishes"
  | "tool-cook-minutes"
  | "tool-cook-step-after"
  | "tool-cook-step-dish"
  | "tool-cook-step-heat"
  | "tool-cook-step-seconds"
  | "tool-cook-step-text"
  | "tool-cook-step-tip"
  | "tool-cook-steps-description"
  | "tool-do-steps-description"
  | "tool-do-steps-steps"
  | "tool-do-steps-summary"
  | "tool-doc-action"
  | "tool-doc-after"
  | "tool-doc-block-id"
  | "tool-doc-edit-description"
  | "tool-doc-heading"
  | "tool-doc-id"
  | "tool-doc-kind"
  | "tool-doc-note"
  | "tool-doc-op"
  | "tool-doc-section-description"
  | "tool-doc-sections"
  | "tool-doc-start-description"
  | "tool-doc-subtitle"
  | "tool-doc-suggest-description"
  | "tool-doc-text"
  | "tool-doc-title"
  | "tool-edit-file-all"
  | "tool-edit-file-description"
  | "tool-edit-file-new"
  | "tool-edit-file-old"
  | "tool-file-from"
  | "tool-file-id"
  | "tool-file-query"
  | "tool-file-read-description"
  | "tool-file-search-description"
  | "tool-file-to"
  | "tool-find-apps-description"
  | "tool-find-apps-query"
  | "tool-find-capability-description"
  | "tool-find-capability-query"
  | "tool-find-threads-description"
  | "tool-find-threads-query"
  | "tool-forget-description"
  | "tool-forget-subject"
  | "tool-gh-args"
  | "tool-gh-description"
  | "tool-git-args"
  | "tool-git-description"
  | "tool-history-at"
  | "tool-history-outline-description"
  | "tool-history-query"
  | "tool-history-read-description"
  | "tool-history-search-description"
  | "tool-kitchen-avoid"
  | "tool-kitchen-dish-minutes"
  | "tool-kitchen-dish-missing"
  | "tool-kitchen-dish-name"
  | "tool-kitchen-dish-photo"
  | "tool-kitchen-dish-uses"
  | "tool-kitchen-dish-why"
  | "tool-kitchen-dishes-description"
  | "tool-kitchen-fridge-description"
  | "tool-kitchen-fridge-items"
  | "tool-kitchen-fridge-remove"
  | "tool-kitchen-fridge-replace"
  | "tool-kitchen-item-amount"
  | "tool-kitchen-item-name"
  | "tool-kitchen-max-minutes"
  | "tool-kitchen-preferences-description"
  | "tool-kitchen-servings"
  | "tool-ledger-add-description"
  | "tool-ledger-amount"
  | "tool-ledger-budget-amount"
  | "tool-ledger-budget-description"
  | "tool-ledger-category"
  | "tool-ledger-delete-description"
  | "tool-ledger-edit-description"
  | "tool-ledger-id"
  | "tool-ledger-name"
  | "tool-ledger-note"
  | "tool-ledger-sort-description"
  | "tool-ledger-sort-key"
  | "tool-ledger-source"
  | "tool-ledger-time"
  | "tool-life-description"
  | "tool-list-dir-depth"
  | "tool-list-dir-description"
  | "tool-list-threads-description"
  | "tool-locate-description"
  | "tool-look-at-app-description"
  | "tool-message-subthread-description"
  | "tool-message-subthread-text"
  | "tool-name-apps"
  | "tool-name-detail"
  | "tool-name-locate"
  | "tool-name-operate"
  | "tool-name-page"
  | "tool-name-remember"
  | "tool-name-search"
  | "tool-name-trip"
  | "tool-name-weather"
  | "tool-open-app-description"
  | "tool-open-app-id"
  | "tool-open-app-name"
  | "tool-open-subthreads-description"
  | "tool-open-subthreads-reason"
  | "tool-operate-app"
  | "tool-operate-app-name"
  | "tool-operate-element"
  | "tool-operate-label"
  | "tool-page"
  | "tool-plan-bounds"
  | "tool-plan-changes"
  | "tool-plan-description"
  | "tool-plan-note"
  | "tool-plan-output-id"
  | "tool-plan-output-label"
  | "tool-plan-question"
  | "tool-plan-step"
  | "tool-plan-step-detail"
  | "tool-plan-step-due"
  | "tool-plan-step-title"
  | "tool-plan-title"
  | "tool-press-keys-description"
  | "tool-press-keys-keys"
  | "tool-read-file-description"
  | "tool-read-file-from"
  | "tool-read-file-to"
  | "tool-read-page-description"
  | "tool-read-page-url"
  | "tool-read-thread-description"
  | "tool-read-thread-id"
  | "tool-read-thread-page"
  | "tool-recall-description"
  | "tool-recall-galaxy"
  | "tool-recall-query"
  | "tool-remember-aliases"
  | "tool-remember-category"
  | "tool-remember-description"
  | "tool-remember-expires"
  | "tool-remember-galaxy"
  | "tool-remember-importance"
  | "tool-remember-kind"
  | "tool-remember-pinned"
  | "tool-remember-replaces"
  | "tool-remember-subject"
  | "tool-remember-value"
  | "tool-run-command-command"
  | "tool-run-command-description"
  | "tool-run-command-reason"
  | "tool-save-place-detail-day"
  | "tool-save-place-detail-description"
  | "tool-save-place-detail-stop"
  | "tool-save-trip-city"
  | "tool-save-trip-cost"
  | "tool-save-trip-day-change"
  | "tool-save-trip-day-date"
  | "tool-save-trip-description"
  | "tool-save-trip-detail-duration"
  | "tool-save-trip-detail-quiet"
  | "tool-save-trip-detail-reviews"
  | "tool-save-trip-detail-suits"
  | "tool-save-trip-detail-tickets"
  | "tool-save-trip-detail-why"
  | "tool-save-trip-needs"
  | "tool-save-trip-next-minutes"
  | "tool-save-trip-next-mode"
  | "tool-save-trip-party"
  | "tool-save-trip-reminder"
  | "tool-save-trip-review-text"
  | "tool-save-trip-source-date"
  | "tool-save-trip-source-title"
  | "tool-save-trip-source-url"
  | "tool-save-trip-stop-detail"
  | "tool-save-trip-stop-name"
  | "tool-save-trip-stop-note"
  | "tool-save-trip-stop-time"
  | "tool-save-trip-title"
  | "tool-save-trip-update"
  | "tool-search-files-description"
  | "tool-search-files-names"
  | "tool-search-files-query"
  | "tool-sheet-cell"
  | "tool-sheet-create-description"
  | "tool-sheet-edit-description"
  | "tool-sheet-op"
  | "tool-sheet-range"
  | "tool-sheet-rows"
  | "tool-sheet-tab"
  | "tool-sheet-title"
  | "tool-shopping-add-description"
  | "tool-shopping-note"
  | "tool-skill-read-description"
  | "tool-skill-read-name"
  | "tool-slides-chart"
  | "tool-slides-columns"
  | "tool-slides-deck-id"
  | "tool-slides-edit-description"
  | "tool-slides-image"
  | "tool-slides-items"
  | "tool-slides-layout"
  | "tool-slides-notes"
  | "tool-slides-op"
  | "tool-slides-page-description"
  | "tool-slides-page-number"
  | "tool-slides-page-title"
  | "tool-slides-pages"
  | "tool-slides-start-description"
  | "tool-slides-subtitle"
  | "tool-slides-theme"
  | "tool-slides-title"
  | "tool-spawn-agents-description"
  | "tool-subthread-task"
  | "tool-subthread-title"
  | "tool-type-text-description"
  | "tool-type-text-text"
  | "tool-weather-days"
  | "tool-weather-description"
  | "tool-weather-place"
  | "tool-web-search-description"
  | "tool-web-search-query"
  | "tool-week-buy"
  | "tool-week-day-date"
  | "tool-week-day-dish"
  | "tool-week-day-takeout"
  | "tool-week-day-why"
  | "tool-week-days"
  | "tool-week-idea"
  | "tool-week-item-group"
  | "tool-week-item-have"
  | "tool-week-item-note"
  | "tool-week-keep"
  | "tool-week-plan-description"
  | "tool-week-prep"
  | "tool-week-prep-text"
  | "tool-week-prep-time"
  | "tool-week-start"
  | "tool-write-file-content"
  | "tool-write-file-description"
  | "trace-joiner"
  | "trace-summary"
  | "trip-amap-food"
  | "trip-back"
  | "trip-back-latest"
  | "trip-calendar-name"
  | "trip-card-meta"
  | "trip-connect-search"
  | "trip-context-body"
  | "trip-context-label"
  | "trip-copy-family"
  | "trip-copy-footer"
  | "trip-copy-stop"
  | "trip-cost"
  | "trip-day"
  | "trip-leg"
  | "trip-leg-estimated"
  | "trip-loading"
  | "trip-mode-taxi"
  | "trip-mode-transit"
  | "trip-mode-walk"
  | "trip-month-day"
  | "trip-nearby-food"
  | "trip-old-version"
  | "trip-open"
  | "trip-open-amap"
  | "trip-range"
  | "trip-reminder"
  | "trip-revise"
  | "trip-revise-quote"
  | "trip-route"
  | "trip-say"
  | "trip-say-placeholder"
  | "trip-send"
  | "trip-sky-clear"
  | "trip-sky-cloudy"
  | "trip-sky-fog"
  | "trip-sky-heavy_rain"
  | "trip-sky-light_rain"
  | "trip-sky-overcast"
  | "trip-sky-rain"
  | "trip-sky-snow"
  | "trip-sky-storm"
  | "trip-stops-joiner"
  | "trip-stops-more"
  | "trip-sync-calendar"
  | "trip-toast-amap"
  | "trip-toast-calendar"
  | "trip-toast-calendar-denied"
  | "trip-toast-calendar-failed"
  | "trip-toast-calendar-handed"
  | "trip-toast-calendar-open"
  | "trip-toast-calendar-retry"
  | "trip-toast-calendar-settings"
  | "trip-toast-copied"
  | "trip-unverified"
  | "trip-unverified-lead"
  | "trip-updated"
  | "trip-view-version"
  | "trip-weather-rain"
  | "trip-weather-range"
  | "trip-weekday-0"
  | "trip-weekday-1"
  | "trip-weekday-2"
  | "trip-weekday-3"
  | "trip-weekday-4"
  | "trip-weekday-5"
  | "trip-weekday-6"
  | "trust-balanced-desc"
  | "trust-balanced-example"
  | "trust-balanced-name"
  | "trust-cautious-desc"
  | "trust-cautious-example"
  | "trust-cautious-name"
  | "trust-hands-off-desc"
  | "trust-hands-off-example"
  | "trust-hands-off-name"
  | "trust-heading"
  | "trust-lead"
  | "trust-red-lines"
  | "turn-regenerate"
  | "versions-count"
  | "versions-next"
  | "versions-previous"
  | "viewer-close"
  | "viewer-copied"
  | "viewer-copy"
  | "viewer-failed"
  | "viewer-next"
  | "viewer-open"
  | "viewer-open-page"
  | "viewer-preview"
  | "viewer-previous"
  | "viewer-save"
  | "viewer-saved"
  | "voice-cancel"
  | "voice-cancel-key"
  | "voice-denied-microphone"
  | "voice-denied-speech"
  | "voice-dictation-off"
  | "voice-done"
  | "voice-hint"
  | "voice-listening"
  | "voice-open-settings"
  | "voice-shortcut"
  | "voice-start"
  | "voice-unavailable"
  | "weather-add"
  | "weather-add-go"
  | "weather-add-label"
  | "weather-add-note"
  | "weather-add-short"
  | "weather-add-tab"
  | "weather-air"
  | "weather-air-tag"
  | "weather-alert-rain"
  | "weather-alert-rain-body"
  | "weather-alert-raining"
  | "weather-alert-summary"
  | "weather-aqi"
  | "weather-aqi-1"
  | "weather-aqi-2"
  | "weather-aqi-3"
  | "weather-aqi-4"
  | "weather-aqi-5"
  | "weather-aqi-6"
  | "weather-city-placeholder"
  | "weather-days"
  | "weather-degrees"
  | "weather-failed"
  | "weather-fri"
  | "weather-home"
  | "weather-hour"
  | "weather-hour-short"
  | "weather-hours"
  | "weather-hours-note"
  | "weather-hours-swipe"
  | "weather-loading"
  | "weather-locate"
  | "weather-menu-here"
  | "weather-menu-home-note"
  | "weather-menu-located"
  | "weather-menu-make-home"
  | "weather-menu-move"
  | "weather-menu-name"
  | "weather-menu-remove"
  | "weather-menu-searched"
  | "weather-menu-where"
  | "weather-mon"
  | "weather-none"
  | "weather-none-failed"
  | "weather-now"
  | "weather-now-line"
  | "weather-percent"
  | "weather-place"
  | "weather-place-active"
  | "weather-place-placeholder"
  | "weather-range"
  | "weather-rhythm"
  | "weather-rhythm-fixed"
  | "weather-rhythm-follow"
  | "weather-rhythm-learning"
  | "weather-rhythm-make-fixed"
  | "weather-rhythm-unsupported"
  | "weather-rule-air"
  | "weather-rule-air-note"
  | "weather-rule-cold"
  | "weather-rule-cold-fixed"
  | "weather-rule-cold-note"
  | "weather-rule-rain"
  | "weather-rule-rain-fixed"
  | "weather-rule-rain-note"
  | "weather-rule-today"
  | "weather-rule-today-fixed"
  | "weather-rule-today-note"
  | "weather-rules"
  | "weather-rules-link"
  | "weather-sat"
  | "weather-sky-clear"
  | "weather-sky-cloudy"
  | "weather-sky-fog"
  | "weather-sky-heavy-rain"
  | "weather-sky-light-rain"
  | "weather-sky-overcast"
  | "weather-sky-rain"
  | "weather-sky-range"
  | "weather-sky-snow"
  | "weather-sky-storm"
  | "weather-sun"
  | "weather-sun-times"
  | "weather-sunset"
  | "weather-thu"
  | "weather-tip-air"
  | "weather-tip-air-detail"
  | "weather-tip-cold"
  | "weather-tip-cold-detail"
  | "weather-tip-rain"
  | "weather-tip-rain-peak"
  | "weather-tip-sun"
  | "weather-tip-sun-detail"
  | "weather-tips"
  | "weather-title"
  | "weather-today"
  | "weather-tue"
  | "weather-updated"
  | "weather-use-here"
  | "weather-use-here-where"
  | "weather-uv"
  | "weather-uv-1"
  | "weather-uv-2"
  | "weather-uv-3"
  | "weather-uv-4"
  | "weather-uv-5"
  | "weather-wed"
  | "week-buy"
  | "week-buy-add"
  | "week-buy-added"
  | "week-buy-note"
  | "week-changed"
  | "week-chat-placeholder"
  | "week-day-label"
  | "week-empty-body"
  | "week-empty-hint"
  | "week-empty-start"
  | "week-empty-title"
  | "week-fill"
  | "week-fill-message"
  | "week-gone"
  | "week-gone-hint"
  | "week-gone-message"
  | "week-have"
  | "week-idea"
  | "week-next"
  | "week-plan-message"
  | "week-prep"
  | "week-prep-item"
  | "week-prep-note"
  | "week-prev"
  | "week-replan"
  | "week-replan-message"
  | "week-subtitle"
  | "week-swap"
  | "week-swap-message"
  | "week-swap-short"
  | "week-tab-menu"
  | "week-tab-shopping"
  | "week-title-next"
  | "week-title-other"
  | "week-title-this"
  | "week-today"
  | "working-show-steps"
  | "workspace-add"
  | "workspace-drop"
  | "workspace-label"
  | "workspace-memories"
  | "workspace-memories-empty"
  | "workspace-memories-hint"
  | "workspace-memory"
  | "workspace-more"
  | "workspace-more-threads"
  | "workspace-new-choose"
  | "workspace-new-empty"
  | "workspace-new-git"
  | "workspace-new-hint"
  | "workspace-new-no-git"
  | "workspace-new-no-repo"
  | "workspace-new-start"
  | "workspace-new-thread"
  | "workspace-new-thread-in"
  | "workspace-new-title"
  | "workspace-open"
  | "workspace-outputs"
  | "workspace-phone"
  | "workspace-phone-connect"
  | "workspace-phone-connected"
  | "workspace-phone-none"
  | "workspace-phone-none-hint"
  | "workspace-remove"
  | "workspace-remove-body"
  | "workspace-remove-title"
  | "workspace-rule-ask"
  | "workspace-rule-inside"
  | "workspace-rule-undo"
  | "workspace-section"
  | "workspace-settings"
  | "workspace-settings-commands"
  | "workspace-settings-commands-hint"
  | "workspace-settings-done"
  | "workspace-settings-editor"
  | "workspace-settings-editor-auto"
  | "workspace-settings-editor-hint"
  | "workspace-settings-editor-system"
  | "workspace-settings-name"
  | "workspace-settings-none"
  | "workspace-settings-place"
  | "workspace-settings-place-hint"
  | "workspace-settings-read"
  | "workspace-settings-remove"
  | "workspace-settings-title"
  | "workspace-settings-write"
  | "workspace-settings-write-hint"
  | "workspace-trip";

export interface MessageArgs {
  "agent-task-label": { title: string | number };
  "agents-done": { steps: string | number };
  "agents-head": { count: string | number };
  "agents-title": { title: string | number };
  "agents-working": { steps: string | number };
  "app-mark": undefined;
  "app-name": undefined;
  "archive-above": undefined;
  "archive-chunk-label": undefined;
  "archive-collapse": undefined;
  "archive-expand": undefined;
  "archive-folded": { count: string | number };
  "archive-loading": undefined;
  "archive-previous-label": undefined;
  "archive-recall-label": undefined;
  "archive-summary": undefined;
  "archive-summary-count": { count: string | number };
  "archive-summary-empty": undefined;
  "archive-summary-foot": undefined;
  "archive-summary-label": undefined;
  "archive-summary-title": undefined;
  "attach-add": undefined;
  "attach-drop": { count: string | number };
  "attach-drop-hint": undefined;
  "attach-read-full": { pages: string | number };
  "attach-read-on-demand": { pages: string | number };
  "attach-remove": { name: string | number };
  "attach-too-big": undefined;
  "attach-too-many": undefined;
  "attach-unreadable": undefined;
  "attach-vision-deepseek": undefined;
  "attach-vision-mimo": undefined;
  "attach-vision-switch": undefined;
  "attach-vision-text-only": undefined;
  "branch-current": { count: string | number };
  "branch-current-clean": undefined;
  "branch-failed": { detail: string | number };
  "branch-menu": undefined;
  "branch-new": undefined;
  "branch-new-placeholder": undefined;
  "branch-pull": undefined;
  "branch-remote": { name: string | number };
  "branch-remote-behind": { count: string | number; name: string | number };
  "branch-restore": undefined;
  "branch-search": undefined;
  "branch-stashed": undefined;
  "branch-switch-body": { branch: string | number; count: string | number };
  "branch-switch-carry": undefined;
  "branch-switch-commit": undefined;
  "branch-switch-hint": undefined;
  "branch-switch-stash": undefined;
  "branch-switch-title": { name: string | number };
  "capability-error-connect": { detail: string | number };
  "capability-error-disabled": undefined;
  "capability-error-keychain": undefined;
  "capability-error-missing": { keys: string | number };
  "capability-error-not-found": undefined;
  "capability-error-rejected": undefined;
  "capability-error-risk": undefined;
  "capability-error-runtime": { runtime: string | number };
  "capability-error-search": undefined;
  "capability-error-sign-in": undefined;
  "capability-error-skill": undefined;
  "capability-error-unsupported": undefined;
  "capability-found-none": undefined;
  "capability-found-note": undefined;
  "capability-need-input": { description: string | number; key: string | number };
  "capability-need-local": { package: string | number; runtime: string | number };
  "capability-need-remote": { host: string | number };
  "capability-need-secret": { description: string | number; key: string | number };
  "capability-need-skill": undefined;
  "capability-need-unverified": undefined;
  "capability-skills-label": undefined;
  "chat-back": undefined;
  "chat-confirm-band": undefined;
  "chat-delete": undefined;
  "chat-more": undefined;
  "chat-placeholder": undefined;
  "chat-sub-primary": { memories: string | number };
  "chat-subtitle-lead": undefined;
  "chat-subtitle-primary": { model: string | number };
  "chats-all": undefined;
  "chats-confirm": { count: string | number };
  "chats-primary-empty": undefined;
  "chats-running": { count: string | number };
  "chats-search": undefined;
  "chats-search-placeholder": undefined;
  "chats-tag-confirm": undefined;
  "chats-tag-plan": { done: string | number; total: string | number };
  "chats-tag-running": undefined;
  "code-add-input": undefined;
  "code-added": { count: string | number };
  "code-binary": undefined;
  "code-branch-changes": { count: string | number };
  "code-card-revert-all": undefined;
  "code-card-reverted": undefined;
  "code-card-title": { count: string | number };
  "code-card-view": undefined;
  "code-changed-count": { count: string | number };
  "code-changes-head": { count: string | number };
  "code-close-tab": { name: string | number };
  "code-copy": undefined;
  "code-copy-path": undefined;
  "code-deleted-file": undefined;
  "code-diff-split": undefined;
  "code-diff-unified": undefined;
  "code-file-binary": undefined;
  "code-file-changed": undefined;
  "code-file-truncated": undefined;
  "code-files": undefined;
  "code-files-collapse": undefined;
  "code-files-expand": undefined;
  "code-files-search": undefined;
  "code-hunk-near": { line: string | number };
  "code-image-failed": undefined;
  "code-image-hint": undefined;
  "code-image-size": { height: string | number; size: string | number; width: string | number };
  "code-look": undefined;
  "code-look-text": { path: string | number };
  "code-mark-added": undefined;
  "code-mark-changed": undefined;
  "code-new-file": undefined;
  "code-no-changes": undefined;
  "code-open": undefined;
  "code-open-editor": undefined;
  "code-panel": undefined;
  "code-preview": undefined;
  "code-quote": { from: string | number; path: string | number; to: string | number };
  "code-removed": { count: string | number };
  "code-resize": undefined;
  "code-resize-width": { width: string | number };
  "code-restore": undefined;
  "code-revert-file": undefined;
  "code-revert-hunk": undefined;
  "code-seconds": { seconds: string | number };
  "code-see-changes": undefined;
  "code-source": undefined;
  "code-status-ahead": { count: string | number; upstream: string | number };
  "code-status-clean": undefined;
  "code-status-no-git": undefined;
  "code-status-uncommitted": { count: string | number };
  "code-tab-changes": undefined;
  "code-tab-git": undefined;
  "code-tab-terminal": undefined;
  "code-terminal-agent": undefined;
  "code-terminal-empty": undefined;
  "code-terminal-failed": { code: string | number };
  "code-terminal-input": undefined;
  "code-terminal-input-busy": undefined;
  "code-terminal-ok": undefined;
  "code-terminal-queued": undefined;
  "code-terminal-running-for": { seconds: string | number };
  "code-terminal-stop": undefined;
  "code-terminal-stopped": undefined;
  "code-terminal-you": undefined;
  "code-undone-block": undefined;
  "code-undone-file": undefined;
  "code-view": undefined;
  "command-pill-declined": { command: string | number };
  "command-pill-failed": { code: string | number; command: string | number };
  "command-pill-ok": { command: string | number };
  "command-pill-timeout": { command: string | number };
  "commit-draft-diff": undefined;
  "commit-draft-files": undefined;
  "commit-draft-recent": undefined;
  "commit-drafting": undefined;
  "commit-hint": undefined;
  "commit-message": undefined;
  "commit-only": undefined;
  "commit-placeholder": undefined;
  "commit-push": undefined;
  "commit-redraft": undefined;
  "commit-title": { count: string | number };
  "composer-cancel-words": undefined;
  "composer-label": undefined;
  "composer-placeholder": undefined;
  "composer-placeholder-busy": undefined;
  "composer-queued": undefined;
  "composer-send": undefined;
  "composer-stop": undefined;
  "confirm-action-edit": undefined;
  "confirm-action-hint": undefined;
  "confirm-action-no": undefined;
  "confirm-action-yes": undefined;
  "confirm-allow-always": undefined;
  "confirm-allow-hint": undefined;
  "confirm-allow-no": undefined;
  "confirm-allow-once": undefined;
  "confirm-allow-title": { app: string | number };
  "confirm-mouse-always": undefined;
  "confirm-mouse-hint": undefined;
  "confirm-mouse-no": undefined;
  "confirm-mouse-once": undefined;
  "confirm-mouse-title": { app: string | number };
  "confirm-permissions-hint": undefined;
  "confirm-permissions-title": undefined;
  "confirm-read-always": { folder: string | number };
  "confirm-read-title": undefined;
  "confirm-run-always": { rule: string | number };
  "confirm-run-cwd": { cwd: string | number };
  "confirm-run-no": undefined;
  "confirm-run-once": undefined;
  "confirm-run-title": undefined;
  "confirm-subthreads-edit": undefined;
  "confirm-subthreads-hint": undefined;
  "confirm-subthreads-item": { title: string | number };
  "confirm-subthreads-no": undefined;
  "confirm-subthreads-title": { count: string | number };
  "confirm-subthreads-yes": undefined;
  "confirm-write-always": { folder: string | number };
  "confirm-write-title": undefined;
  "conflict-abort": undefined;
  "conflict-abort-body": undefined;
  "conflict-abort-title": undefined;
  "conflict-all-done": undefined;
  "conflict-ask": undefined;
  "conflict-ask-text": { incoming: string | number; line: string | number; path: string | number };
  "conflict-banner": { branch: string | number; incoming: string | number };
  "conflict-bar": { count: string | number };
  "conflict-bar-done": undefined;
  "conflict-count": { blocks: string | number; files: string | number };
  "conflict-editor": undefined;
  "conflict-finish": undefined;
  "conflict-incoming": undefined;
  "conflict-left": { count: string | number };
  "conflict-mark": undefined;
  "conflict-none-left": undefined;
  "conflict-number": { number: string | number; total: string | number };
  "conflict-ours": { branch: string | number };
  "conflict-tab": undefined;
  "conflict-theirs": { branch: string | number };
  "conflict-use-both": undefined;
  "conflict-use-ours": undefined;
  "conflict-use-theirs": undefined;
  "conflict-where": { line: string | number; path: string | number };
  "connection-closed": undefined;
  "connection-connecting": undefined;
  "connection-idle": undefined;
  "connection-open": undefined;
  "connection-reconnecting": undefined;
  "connection-waiting-for-hub": undefined;
  "consent-agree": undefined;
  "consent-bullet": { text: string | number };
  "consent-can": undefined;
  "consent-can-body": undefined;
  "consent-cannot": undefined;
  "consent-cannot-body": undefined;
  "consent-close": undefined;
  "consent-later": undefined;
  "consent-lead": undefined;
  "consent-off-1": undefined;
  "consent-off-2": undefined;
  "consent-off-title": undefined;
  "consent-open": undefined;
  "consent-see-note": undefined;
  "consent-see-title": undefined;
  "consent-title": undefined;
  "consent-use-1": undefined;
  "consent-use-2": undefined;
  "consent-use-lead": undefined;
  "consent-use-title": undefined;
  "context-amount": { percent: string | number; used: string | number; window: string | number };
  "context-auto": undefined;
  "context-auto-note": undefined;
  "context-auto-off": undefined;
  "context-compact": undefined;
  "context-compact-failed": undefined;
  "context-compact-note": undefined;
  "context-compact-short": undefined;
  "context-compacted": { from: string | number; to: string | number };
  "context-compacting": undefined;
  "context-compacting-hint": undefined;
  "context-compacting-pill": undefined;
  "context-help": undefined;
  "context-title": undefined;
  "context-trigger": { percent: string | number };
  "cook-ask-placeholder": undefined;
  "cook-back": undefined;
  "cook-check": undefined;
  "cook-count": { n: string | number; total: string | number };
  "cook-done": undefined;
  "cook-finished-message": undefined;
  "cook-meta": { minutes: string | number; servings: string | number };
  "cook-next": undefined;
  "cook-next-step": undefined;
  "cook-planning": undefined;
  "cook-prev": undefined;
  "cook-prev-step": undefined;
  "cook-progress": { dish: string | number; n: string | number; total: string | number };
  "cook-start-timer": { time: string | number };
  "cook-step-n": { n: string | number };
  "cook-steps-head": { count: string | number };
  "cook-talk": undefined;
  "cook-timer-label": { dish: string | number; step: string | number };
  "cook-timer-running": { left: string | number };
  "cook-timing": undefined;
  "cook-title": undefined;
  "cook-you-asked": { text: string | number };
  "custom-api-anthropic": undefined;
  "custom-api-anthropic-hint": undefined;
  "custom-api-label": undefined;
  "custom-api-open_ai": undefined;
  "custom-api-open_ai-hint": undefined;
  "custom-api-responses": undefined;
  "custom-api-responses-hint": undefined;
  "custom-base-url-hint": undefined;
  "custom-base-url-label": undefined;
  "custom-base-url-placeholder": undefined;
  "custom-card-hint": undefined;
  "custom-description": undefined;
  "custom-label-label": undefined;
  "custom-label-placeholder": undefined;
  "custom-model-label": undefined;
  "custom-model-placeholder": undefined;
  "custom-trust-warning": undefined;
  "daily-afternoon": undefined;
  "daily-arrange": undefined;
  "daily-arrange-done": undefined;
  "daily-arrange-hint": undefined;
  "daily-card-confirm": undefined;
  "daily-confirm": { count: string | number };
  "daily-dot": undefined;
  "daily-drag": { title: string | number };
  "daily-drop-here": undefined;
  "daily-evening": undefined;
  "daily-food": undefined;
  "daily-food-empty": undefined;
  "daily-food-start": undefined;
  "daily-hello-name": { greeting: string | number; name: string | number };
  "daily-hidden": undefined;
  "daily-hidden-none": undefined;
  "daily-hide": undefined;
  "daily-money": undefined;
  "daily-money-budget": { amount: string | number };
  "daily-money-empty": undefined;
  "daily-more-body": undefined;
  "daily-more-title": undefined;
  "daily-morning": undefined;
  "daily-narrow": undefined;
  "daily-open-kitchen": undefined;
  "daily-open-ledger": undefined;
  "daily-open-weather": undefined;
  "daily-plans": undefined;
  "daily-plans-count": { count: string | number };
  "daily-plans-empty": undefined;
  "daily-reset": undefined;
  "daily-shopping": { count: string | number };
  "daily-show": { title: string | number };
  "daily-size": undefined;
  "daily-talk": undefined;
  "daily-wide": undefined;
  "delete-thread-body": undefined;
  "delete-thread-confirm": undefined;
  "delete-thread-title": { title: string | number };
  delivered: undefined;
  "device-android": undefined;
  "device-desktop": undefined;
  "device-ios": undefined;
  "dialog-cancel": undefined;
  "dialog-close": undefined;
  "doc-act-ask": undefined;
  "doc-act-ask-more": undefined;
  "doc-act-ask-placeholder": undefined;
  "doc-act-example": undefined;
  "doc-act-longer": undefined;
  "doc-act-plain": undefined;
  "doc-act-shorter": undefined;
  "doc-act-tone": undefined;
  "doc-another": undefined;
  "doc-another-button": undefined;
  "doc-ask-action": { action: string | number };
  "doc-ask-question": { question: string | number };
  "doc-back": undefined;
  "doc-chat-hint": undefined;
  "doc-chat-note": undefined;
  "doc-chat-placeholder": undefined;
  "doc-compare": undefined;
  "doc-compare-exit": undefined;
  "doc-comparing": { previous: string | number; version: string | number };
  "doc-context-label": { title: string | number };
  "doc-export": undefined;
  "doc-export-note": undefined;
  "doc-export-pdf": undefined;
  "doc-export-word": undefined;
  "doc-format-copy": undefined;
  "doc-format-md": undefined;
  "doc-format-pdf": undefined;
  "doc-format-word": undefined;
  "doc-icon": undefined;
  "doc-keep-original": undefined;
  "doc-mark-keep": undefined;
  "doc-mark-undo": undefined;
  "doc-marks-count": { count: string | number };
  "doc-marks-keep-all": undefined;
  "doc-marks-undo-all": undefined;
  "doc-meta": { chars: string | number; sections: string | number };
  "doc-more-sections": { count: string | number };
  "doc-open": undefined;
  "doc-open-word": undefined;
  "doc-outline": undefined;
  "doc-outline-hint": undefined;
  "doc-restore": undefined;
  "doc-saved": { chars: string | number };
  "doc-selected-body": {
    action: string | number;
    id: string | number;
    paragraph: string | number;
    selected: string | number;
  };
  "doc-selected-label": undefined;
  "doc-suggestion-head": { action: string | number; where: string | number };
  "doc-tone-formal": undefined;
  "doc-tone-simple": undefined;
  "doc-tone-warm": undefined;
  "doc-use": undefined;
  "doc-version": { version: string | number };
  "doc-version-first": undefined;
  "doc-version-name": { version: string | number };
  "doc-version-restored": { version: string | number };
  "doc-version-user": undefined;
  "doc-watch": undefined;
  "doc-writing": { n: string | number; total: string | number };
  "draft-background": undefined;
  "draft-background-running": undefined;
  "draft-background-untitled": undefined;
  "draft-elapsed": { seconds: string | number };
  "draft-failed": { reason: string | number };
  "draft-failed-retry": { reason: string | number };
  "draft-long-wait": { seconds: string | number };
  "draft-stopped": undefined;
  "draft-thinking": undefined;
  "draft-unreachable": undefined;
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
  "failure-invalid-endpoint": undefined;
  "failure-invalid-key": undefined;
  "failure-model": undefined;
  "failure-network": undefined;
  "failure-not-configured": undefined;
  "failure-unknown-model": undefined;
  "failure-unknown-model-listed": { model: string | number; models: string | number };
  "file-look-again": { name: string | number };
  "file-menu-copy": undefined;
  "file-menu-look-again": undefined;
  "file-menu-open": undefined;
  "file-menu-reveal-mac": undefined;
  "file-menu-reveal-windows": undefined;
  "file-menu-save-as": undefined;
  "file-note-full": { name: string | number; pages: string | number };
  "file-note-image": { name: string | number };
  "file-note-on-demand": { id: string | number; name: string | number; pages: string | number };
  "file-note-outline": undefined;
  "file-note-preview": undefined;
  "file-note-unreadable": { name: string | number };
  "file-open-hint": undefined;
  "file-open-label": { name: string | number };
  "fridge-amount-placeholder": undefined;
  "fridge-edit-hint": undefined;
  "fridge-hint": undefined;
  "fridge-hint-phone": undefined;
  "fridge-left": undefined;
  "fridge-remove": { name: string | number };
  "fridge-stale": { days: string | number };
  "fridge-stale-phone": { days: string | number };
  "fridge-used-up": undefined;
  "fridge-used-up-shop": undefined;
  "git-ahead": { ahead: string | number; behind: string | number; upstream: string | number };
  "git-all-branches": undefined;
  "git-commit": undefined;
  "git-commit-meta": {
    author: string | number;
    count: string | number;
    short: string | number;
    time: string | number;
  };
  "git-commit-open": undefined;
  "git-copy-hash": undefined;
  "git-explain": undefined;
  "git-explain-text": { short: string | number };
  "git-init": undefined;
  "git-not-repo": undefined;
  "git-not-repo-hint": undefined;
  "git-pr": undefined;
  "git-pr-opening": undefined;
  "git-this-branch": undefined;
  "git-working": undefined;
  "git-working-files": { count: string | number };
  "heat-high": undefined;
  "heat-low": undefined;
  "heat-medium": undefined;
  "heat-none": undefined;
  "home-context-label": undefined;
  "home-greeting": undefined;
  "home-greeting-named": { name: string | number };
  "home-greeting-suggest": undefined;
  "home-suggestion-expense": undefined;
  "home-suggestion-umbrella": undefined;
  "home-suggestion-weekend": undefined;
  "hub-default-name": undefined;
  "image-menu-copy": undefined;
  "image-menu-download": undefined;
  "image-menu-preview-mac": undefined;
  "image-menu-preview-windows": undefined;
  "image-menu-zoom": undefined;
  "island-collapse": undefined;
  "island-done": { count: string | number; title: string | number };
  "island-done-reply": { title: string | number };
  "island-hint": undefined;
  "island-menu-expand": undefined;
  "island-menu-home": undefined;
  "island-menu-quit": undefined;
  "island-menu-settings": undefined;
  "island-menu-snooze": undefined;
  "island-note-label": undefined;
  "island-note-placeholder": undefined;
  "island-open": undefined;
  "island-open-main": undefined;
  "island-pause": undefined;
  "island-paused": undefined;
  "island-resume": undefined;
  "island-step-count": { n: string | number };
  "island-step-line": { n: string | number; text: string | number };
  "island-stop": undefined;
  "island-title": { n: string | number; title: string | number };
  "island-title-app": { app: string | number; n: string | number };
  "island-title-app-background": { app: string | number; n: string | number };
  "keep-chilled": undefined;
  "keep-frozen": undefined;
  "keep-room": undefined;
  "kitchen-add-missing": undefined;
  "kitchen-add-photo": undefined;
  "kitchen-another": undefined;
  "kitchen-another-batch": undefined;
  "kitchen-ask": undefined;
  "kitchen-ask-tonight": undefined;
  "kitchen-avoid": { items: string | number };
  "kitchen-back": undefined;
  "kitchen-cart": undefined;
  "kitchen-carted": undefined;
  "kitchen-chat": undefined;
  "kitchen-chat-hint": undefined;
  "kitchen-chat-note": undefined;
  "kitchen-chat-placeholder": undefined;
  "kitchen-clear-bought": undefined;
  "kitchen-context-label": undefined;
  "kitchen-cook-go": undefined;
  "kitchen-empty-body": undefined;
  "kitchen-empty-body-phone": undefined;
  "kitchen-empty-title": undefined;
  "kitchen-fridge": undefined;
  "kitchen-fridge-empty": undefined;
  "kitchen-fridge-empty-phone": undefined;
  "kitchen-have-all": undefined;
  "kitchen-item": { amount: string | number; name: string | number };
  "kitchen-joiner": undefined;
  "kitchen-listening": undefined;
  "kitchen-minutes": { minutes: string | number };
  "kitchen-missing": { items: string | number };
  "kitchen-no-buy": undefined;
  "kitchen-photo-empty": undefined;
  "kitchen-photo-filter": undefined;
  "kitchen-photo-message": undefined;
  "kitchen-photo-when": { when: string | number };
  "kitchen-pick-missing": { items: string | number };
  "kitchen-pick-ready": undefined;
  "kitchen-plus": undefined;
  "kitchen-resume-cook": undefined;
  "kitchen-retake": undefined;
  "kitchen-rules": undefined;
  "kitchen-rules-hint": undefined;
  "kitchen-servings": { count: string | number };
  "kitchen-servings-unknown": undefined;
  "kitchen-shopping-empty": undefined;
  "kitchen-shopping-empty-phone": undefined;
  "kitchen-shopping-left": { count: string | number };
  "kitchen-start": { dishes: string | number };
  "kitchen-start-button": undefined;
  "kitchen-suggested": undefined;
  "kitchen-suggested-note": { count: string | number; minutes: string | number };
  "kitchen-suggested-phone": { minutes: string | number };
  "kitchen-summary": { minutes: string | number; servings: string | number };
  "kitchen-summary-all": undefined;
  "kitchen-summary-missing": { count: string | number };
  "kitchen-tab-shopping": undefined;
  "kitchen-tab-tonight": undefined;
  "kitchen-tab-week": undefined;
  "kitchen-thinking": undefined;
  "kitchen-thread-title": undefined;
  "kitchen-title": undefined;
  "kitchen-used-hint": undefined;
  "kitchen-uses": { items: string | number };
  "kitchen-uses-count": { count: string | number };
  "kitchen-within": { minutes: string | number };
  "ledger-all": undefined;
  "ledger-app-alipay": undefined;
  "ledger-app-alipay-name": undefined;
  "ledger-app-wechat": undefined;
  "ledger-app-wechat-name": undefined;
  "ledger-bill-filter": undefined;
  "ledger-budget": { amount: string | number };
  "ledger-budget-edit": undefined;
  "ledger-budget-label": undefined;
  "ledger-budget-none-phone": undefined;
  "ledger-budget-set": undefined;
  "ledger-by-category": undefined;
  "ledger-cancel": undefined;
  "ledger-cat-clothes": undefined;
  "ledger-cat-dining": undefined;
  "ledger-cat-fun": undefined;
  "ledger-cat-gifts": undefined;
  "ledger-cat-health": undefined;
  "ledger-cat-household": undefined;
  "ledger-cat-housing": undefined;
  "ledger-cat-kids": undefined;
  "ledger-cat-other": undefined;
  "ledger-cat-transport": undefined;
  "ledger-chat-hint": undefined;
  "ledger-chat-note": undefined;
  "ledger-chat-placeholder": undefined;
  "ledger-context-label": undefined;
  "ledger-delete": undefined;
  "ledger-edit": undefined;
  "ledger-edit-amount": undefined;
  "ledger-edit-category": undefined;
  "ledger-edit-name": undefined;
  "ledger-empty-bill": undefined;
  "ledger-empty-body": undefined;
  "ledger-empty-budget": undefined;
  "ledger-empty-import": undefined;
  "ledger-empty-receipt": undefined;
  "ledger-empty-say": undefined;
  "ledger-empty-say-phone": undefined;
  "ledger-empty-title": undefined;
  "ledger-filter-hint": undefined;
  "ledger-filter-on": { category: string | number };
  "ledger-flow-empty": undefined;
  "ledger-flow-head": { count: string | number; month: string | number; scope: string | number };
  "ledger-flow-head-range": {
    count: string | number;
    range: string | number;
    scope: string | number;
  };
  "ledger-flow-hint": undefined;
  "ledger-flow-hint-phone": undefined;
  "ledger-import": undefined;
  "ledger-import-commit": { count: string | number };
  "ledger-import-failed": undefined;
  "ledger-import-label": undefined;
  "ledger-import-message": undefined;
  "ledger-import-meta": {
    app: string | number;
    count: string | number;
    from: string | number;
    to: string | number;
  };
  "ledger-import-note": undefined;
  "ledger-import-sorting": undefined;
  "ledger-import-summary": {
    dup: string | number;
    fresh: string | number;
    skipped: string | number;
  };
  "ledger-import-title-phone": { app: string | number; count: string | number };
  "ledger-left": { amount: string | number };
  "ledger-month-none": undefined;
  "ledger-month-short": { month: string | number };
  "ledger-mute": undefined;
  "ledger-next": undefined;
  "ledger-next-month": undefined;
  "ledger-next-range": undefined;
  "ledger-next-year": undefined;
  "ledger-no-budget": undefined;
  "ledger-noticed": undefined;
  "ledger-noticed-up": { amount: string | number; category: string | number; pct: string | number };
  "ledger-open-week": undefined;
  "ledger-other": undefined;
  "ledger-over": { amount: string | number };
  "ledger-pace-even": undefined;
  "ledger-pace-over": { amount: string | number };
  "ledger-pace-save": { amount: string | number };
  "ledger-past-left": { amount: string | number };
  "ledger-past-over": { amount: string | number };
  "ledger-picker": undefined;
  "ledger-picker-label": { title: string | number };
  "ledger-picker-month": undefined;
  "ledger-picker-month-hint": undefined;
  "ledger-picker-range": undefined;
  "ledger-picker-range-hint": undefined;
  "ledger-picker-range-note": undefined;
  "ledger-preset-30": undefined;
  "ledger-preset-7": undefined;
  "ledger-preset-last-week": undefined;
  "ledger-preset-week": undefined;
  "ledger-preset-year": undefined;
  "ledger-prev": undefined;
  "ledger-prev-month": undefined;
  "ledger-prev-range": undefined;
  "ledger-prev-year": undefined;
  "ledger-range-count": { days: string | number };
  "ledger-range-daily": { amount: string | number };
  "ledger-range-days": { days: string | number; range: string | number };
  "ledger-range-go": undefined;
  "ledger-range-less": { amount: string | number; days: string | number };
  "ledger-range-more": { amount: string | number; days: string | number };
  "ledger-range-spent": { range: string | number };
  "ledger-receipt-message": undefined;
  "ledger-row-when": { day: string | number; time: string | number };
  "ledger-save": undefined;
  "ledger-search": undefined;
  "ledger-source-import": undefined;
  "ledger-source-receipt": undefined;
  "ledger-source-said": undefined;
  "ledger-spent": { month: string | number };
  "ledger-status-duplicate": undefined;
  "ledger-status-income": undefined;
  "ledger-status-new": undefined;
  "ledger-status-refund": undefined;
  "ledger-status-transfer": undefined;
  "ledger-this-month": undefined;
  "ledger-thread-title": undefined;
  "ledger-title": undefined;
  "ledger-today": undefined;
  "ledger-year": { year: string | number };
  "ledger-yesterday": { date: string | number };
  "life-delete": undefined;
  "location-place": { city: string | number; district: string | number };
  "look-up-message": undefined;
  "looking-elapsed": { seconds: string | number };
  "looking-slow": undefined;
  "looking-stop": undefined;
  "looking-title": undefined;
  "md-alert-caution": undefined;
  "md-alert-important": undefined;
  "md-alert-note": undefined;
  "md-alert-tip": undefined;
  "md-alert-warning": undefined;
  "me-autonomy": undefined;
  "me-autonomy-current": undefined;
  "me-computer": undefined;
  "me-computer-online": undefined;
  "me-connect-computer": undefined;
  "me-connected": undefined;
  "me-days": { days: string | number };
  "me-forget": undefined;
  "me-memories": undefined;
  "me-memories-count": { count: string | number };
  "me-memories-hint": undefined;
  "me-unpair": undefined;
  "me-unpair-body": undefined;
  "me-unpair-title": undefined;
  "me-you": undefined;
  "meet-all-set": undefined;
  "meet-failed": { reason: string | number };
  "meet-heading": undefined;
  "meet-input-placeholder": undefined;
  "meet-intro": undefined;
  "meet-lead": undefined;
  "meet-locating": undefined;
  "meet-location-guess": { place: string | number };
  "meet-location-missing": undefined;
  "meet-location-note": undefined;
  "meet-progress": { current: string | number; total: string | number };
  "meet-question-home-and-work": undefined;
  "meet-question-household": undefined;
  "meet-question-preferred-name": undefined;
  "meet-reading": undefined;
  "meet-remembered": { topic: string | number; value: string | number };
  "meet-reply-alone": undefined;
  "meet-reply-guess-right": undefined;
  "meet-reply-guess-wrong": undefined;
  "meet-reply-pass": undefined;
  "meet-unclear": undefined;
  "memory-card-aliases": { aliases: string | number };
  "memory-card-constraint": undefined;
  "memory-card-edit": undefined;
  "memory-card-edit-prompt": { subject: string | number };
  "memory-card-forget": undefined;
  "memory-card-meta": { date: string | number; uses: string | number };
  "memory-card-pin": undefined;
  "memory-card-pinned": undefined;
  "memory-card-separator": undefined;
  "memory-card-unpin": undefined;
  "memory-category-family": undefined;
  "memory-category-food": undefined;
  "memory-category-home_work": undefined;
  "memory-category-likes": undefined;
  "memory-category-other": undefined;
  "memory-category-plans": undefined;
  "memory-graph-count": { count: string | number };
  "memory-graph-few": undefined;
  "memory-graph-glowing": { count: string | number };
  "memory-graph-legend": { category: string | number; count: string | number };
  "memory-graph-recent": undefined;
  "memory-graph-tip": { category: string | number; date: string | number; uses: string | number };
  "memory-graph-used-title": undefined;
  "memory-recall-label": undefined;
  "memory-saved-chip": { subject: string | number; value: string | number };
  "memory-sky-all": undefined;
  "memory-sky-count": { count: string | number };
  "memory-sky-crumb-separator": undefined;
  "memory-sky-crumbs": undefined;
  "memory-sky-expand": undefined;
  "memory-sky-hint": undefined;
  "memory-sky-label": { count: string | number };
  "memory-sky-loose": undefined;
  "memory-sky-search": undefined;
  "memory-sky-search-placeholder": undefined;
  "memory-sky-summary": { count: string | number; pinned: string | number };
  "memory-sky-title": undefined;
  "memory-topic-home-and-work": undefined;
  "memory-topic-household": undefined;
  "memory-topic-preferred-name": undefined;
  "menu-copy": undefined;
  "menu-cut": undefined;
  "menu-delete-thread": undefined;
  "menu-key-space": undefined;
  "menu-look-up": undefined;
  "menu-mark-unread": undefined;
  "menu-new-thread-with": undefined;
  "menu-open": undefined;
  "menu-paste": undefined;
  "menu-quote": undefined;
  "menu-quote-selection": undefined;
  "menu-read-aloud": undefined;
  "menu-regenerate": undefined;
  "menu-regenerate-last-only": undefined;
  "menu-rename": undefined;
  "menu-select-all": undefined;
  "menu-stop-reading": undefined;
  "menu-voice": undefined;
  "model-add": undefined;
  "model-current": undefined;
  "model-heading": undefined;
  "model-lead": undefined;
  "model-not-connected": undefined;
  "model-switch-failed": undefined;
  "model-switching": undefined;
  "nav-chat": undefined;
  "nav-daily": undefined;
  "nav-main": undefined;
  "nav-me": undefined;
  "nav-skills": undefined;
  "nav-soon": undefined;
  "now-context-label": undefined;
  "onboarding-back": undefined;
  "onboarding-checking": undefined;
  "onboarding-cost-note": undefined;
  "onboarding-finish": undefined;
  "onboarding-get-key": { provider: string | number };
  "onboarding-hello": undefined;
  "onboarding-hide-key": undefined;
  "onboarding-intro": undefined;
  "onboarding-key-label": undefined;
  "onboarding-key-local": undefined;
  "onboarding-key-placeholder": { provider: string | number };
  "onboarding-later": undefined;
  "onboarding-local-first": undefined;
  "onboarding-next": undefined;
  "onboarding-pick-provider": undefined;
  "onboarding-privacy": undefined;
  "onboarding-progress": { step: string | number; total: string | number };
  "onboarding-recommended": undefined;
  "onboarding-show-key": undefined;
  "onboarding-skip": undefined;
  "onboarding-submit": undefined;
  "operate-consent-control": undefined;
  "operate-consent-control-body": undefined;
  "operate-consent-later": undefined;
  "operate-consent-lead": undefined;
  "operate-consent-limits": undefined;
  "operate-consent-limits-body": undefined;
  "operate-consent-open": undefined;
  "operate-consent-permissions": undefined;
  "operate-consent-stop": undefined;
  "operate-consent-stop-body": undefined;
  "operate-consent-title": undefined;
  "operate-consent-what": undefined;
  "operate-consent-what-body": undefined;
  "operate-end": undefined;
  "operate-fill": { label: string | number };
  "operate-handover-back": undefined;
  "operate-handover-body": { label: string | number };
  "operate-handover-ok": undefined;
  "operate-handover-title": undefined;
  "operate-pause": undefined;
  "operate-paused-detail": { n: string | number };
  "operate-paused-title": undefined;
  "operate-press": { label: string | number };
  "operate-resume": undefined;
  "operate-stop": undefined;
  "operate-working": { n: string | number };
  "overlay-click": { label: string | number; n: string | number };
  "overlay-click-real": { label: string | number; n: string | number };
  "overlay-type": { label: string | number; n: string | number };
  "overlay-type-real": { label: string | number; n: string | number };
  "overlay-unnamed": undefined;
  "pair-address-placeholder": undefined;
  "pair-code-placeholder": undefined;
  "pair-hello": undefined;
  "pair-home-lead": undefined;
  "pair-lead": undefined;
  "pair-or-manual": undefined;
  "pair-scan": undefined;
  "pair-scan-lead": undefined;
  "pair-submit": undefined;
  "pair-submitting": undefined;
  "pair-title": undefined;
  "pairing-dialog-title": undefined;
  "panel-list-hide": { shortcut: string | number };
  "panel-list-shortcut": undefined;
  "panel-list-show": { shortcut: string | number };
  "panel-workspace-hide": { shortcut: string | number };
  "panel-workspace-shortcut": undefined;
  "panel-workspace-show": { shortcut: string | number };
  "phone-address-label": undefined;
  "phone-code-expired": undefined;
  "phone-code-label": { time: string | number };
  "phone-connected": { name: string | number };
  "phone-heading": undefined;
  "phone-lead": undefined;
  "phone-no-network": undefined;
  "phone-qr-label": undefined;
  "phone-refresh": undefined;
  "phone-relay-hint": undefined;
  "phone-step-install": undefined;
  "phone-step-scan": undefined;
  "phone-step-wifi": undefined;
  "phone-waiting": undefined;
  "place-ask": undefined;
  "place-ask-message": { name: string | number };
  "place-checked": { date: string | number };
  "place-checked-old": { date: string | number };
  "place-close": undefined;
  "place-duration": undefined;
  "place-empty": undefined;
  "place-meta": { day: string | number; time: string | number };
  "place-photos": undefined;
  "place-quiet": undefined;
  "place-remove": undefined;
  "place-remove-message": { day: string | number; name: string | number };
  "place-replace": undefined;
  "place-replace-message": { day: string | number; name: string | number };
  "place-review": { text: string | number };
  "place-review-source": { date: string | number; title: string | number };
  "place-reviews": undefined;
  "place-source": { title: string | number };
  "place-suits": undefined;
  "place-tickets": undefined;
  "place-unverified": undefined;
  "place-why": undefined;
  "plan-adjusted": undefined;
  "plan-approve": undefined;
  "plan-approved": { title: string | number; version: string | number };
  "plan-blocked-title": { title: string | number };
  "plan-bounds": { bounds: string | number };
  "plan-chosen": { option: string | number };
  "plan-collapse": undefined;
  "plan-context-label": undefined;
  "plan-continue": undefined;
  "plan-dismiss": undefined;
  "plan-dock": undefined;
  "plan-draft-hint": undefined;
  "plan-draft-tag": { version: string | number };
  "plan-expand": undefined;
  "plan-output-deck": undefined;
  "plan-output-doc": undefined;
  "plan-output-prefixes": undefined;
  "plan-output-sheet": undefined;
  "plan-output-text": undefined;
  "plan-pause": undefined;
  "plan-reply": undefined;
  "plan-resume": undefined;
  "plan-resumed": undefined;
  "plan-ring": { done: string | number; total: string | number };
  "plan-step-doing": undefined;
  "plan-step-done": { step: string | number; title: string | number };
  "plan-stuck": { step: string | number };
  "plan-sub-blocked": undefined;
  "plan-sub-doing": { step: string | number };
  "plan-sub-done": undefined;
  "plan-sub-draft": { version: string | number };
  "plan-sub-paused": undefined;
  "plan-undock": undefined;
  "prep-due-title": undefined;
  "prompt-archive": undefined;
  "prompt-capability-policy": undefined;
  "prompt-commit-message": undefined;
  "prompt-doc": undefined;
  "prompt-interpret-answer": undefined;
  "prompt-kitchen": undefined;
  "prompt-ledger": undefined;
  "prompt-memory-galaxies": undefined;
  "prompt-memory-heading": undefined;
  "prompt-memory-policy": undefined;
  "prompt-memory-tidy": undefined;
  "prompt-phone": undefined;
  "prompt-sheet": undefined;
  "prompt-slides": undefined;
  "prompt-system": undefined;
  "prompt-thinking-pick": undefined;
  "prompt-thread-title": undefined;
  "prompt-tool-policy": undefined;
  "prompt-workspace": { name: string | number; path: string | number };
  "provider-custom": undefined;
  "provider-deepseek": undefined;
  "provider-mimo": undefined;
  "quote-collapse": undefined;
  "quote-context-label": undefined;
  "quote-expand": undefined;
  "quote-from-assistant": undefined;
  "quote-from-user": undefined;
  "quote-gone": undefined;
  "quote-image": undefined;
  "quote-label": undefined;
  "quote-remove": undefined;
  "quote-table": undefined;
  "reasoning-hide": undefined;
  "reasoning-show": undefined;
  "reasoning-thinking": { seconds: string | number };
  "reasoning-thought": { seconds: string | number };
  "ref-ask-failure": { number: string | number };
  "ref-checks-failed": { count: string | number };
  "ref-checks-passed": undefined;
  "ref-checks-pending": { done: string | number; total: string | number };
  "ref-closed": undefined;
  "ref-comments": { count: string | number };
  "ref-draft": undefined;
  "ref-files": { count: string | number };
  "ref-issue-label": { number: string | number };
  "ref-issue-where": { number: string | number; repo: string | number };
  "ref-look-failure": undefined;
  "ref-merged": undefined;
  "ref-more-checks": { count: string | number };
  "ref-number": { number: string | number };
  "ref-open": undefined;
  "ref-open-browser": undefined;
  "ref-pin": undefined;
  "ref-pins-less": undefined;
  "ref-pins-more": { count: string | number };
  "ref-pr-label": { number: string | number };
  "ref-pr-where": { number: string | number; repo: string | number };
  "ref-table-headers": undefined;
  "ref-unpin": undefined;
  "reply-meta": { seconds: string | number; time: string | number };
  "reply-thought": { seconds: string | number };
  "reply-thought-effort": { effort: string | number; seconds: string | number };
  "reply-time": { time: string | number };
  "rich-copied": undefined;
  "rich-copy": undefined;
  "rich-footnote-back": undefined;
  "rich-footnotes": undefined;
  "rich-image-copy-link": undefined;
  "rich-image-failed": undefined;
  "rich-image-open": undefined;
  "scan-connecting": undefined;
  "scan-denied-body": undefined;
  "scan-denied-title": undefined;
  "scan-found": { name: string | number };
  "scan-found-note": undefined;
  "scan-found-unnamed": undefined;
  "scan-hint": undefined;
  "scan-manual": undefined;
  "scan-open-settings": undefined;
  "scan-retry": undefined;
  "scan-title": undefined;
  "scan-torch": undefined;
  "search-card-connected": undefined;
  "search-card-invalid": undefined;
  "search-card-key": undefined;
  "search-card-keychain": undefined;
  "search-card-offline": undefined;
  "search-card-placeholder": undefined;
  "search-card-platform": undefined;
  "search-card-resuming": undefined;
  "search-card-save": undefined;
  "search-card-skip": undefined;
  "search-card-skipped": undefined;
  "search-card-skipped-hint": undefined;
  "search-card-step-1": { platform: string | number };
  "search-card-step-2": undefined;
  "search-card-subtitle": undefined;
  "search-card-title": undefined;
  "search-card-verifying": undefined;
  "search-label": undefined;
  "search-placeholder": undefined;
  "service-declined-search": undefined;
  "service-resume-search": undefined;
  "setup-key-local": undefined;
  "setup-more": undefined;
  "setup-recommended": { provider: string | number };
  "setup-scan": undefined;
  "sheet-ask-range": { question: string | number; range: string | number };
  "sheet-chart": undefined;
  "sheet-chart-bar": undefined;
  "sheet-chart-line": undefined;
  "sheet-chart-pie": undefined;
  "sheet-chart-remove": undefined;
  "sheet-chat-hint": undefined;
  "sheet-chat-note": undefined;
  "sheet-chat-placeholder": undefined;
  "sheet-col-delete": { count: string | number };
  "sheet-col-left": undefined;
  "sheet-col-right": undefined;
  "sheet-computed": undefined;
  "sheet-context-label": { title: string | number };
  "sheet-draw": undefined;
  "sheet-export-csv": undefined;
  "sheet-export-excel": undefined;
  "sheet-export-note": undefined;
  "sheet-format-copy": undefined;
  "sheet-format-csv": undefined;
  "sheet-format-xlsx": undefined;
  "sheet-formula": undefined;
  "sheet-icon": undefined;
  "sheet-lowest": undefined;
  "sheet-mark-lowest": { range: string | number };
  "sheet-marks-count": { count: string | number };
  "sheet-meta": { cols: string | number; rows: string | number; tabs: string | number };
  "sheet-more-rows": { count: string | number };
  "sheet-open-excel": undefined;
  "sheet-open-in-xiaoban": undefined;
  "sheet-row-above": undefined;
  "sheet-row-below": undefined;
  "sheet-row-delete": { count: string | number };
  "sheet-saved": { tabs: string | number };
  "sheet-sort": undefined;
  "sheet-sort-asc": undefined;
  "sheet-sort-desc": undefined;
  "sheet-status-avg": { value: string | number };
  "sheet-status-count": { count: string | number };
  "sheet-status-hint": undefined;
  "sheet-status-min": { value: string | number };
  "sheet-status-sum": { value: string | number };
  "sheet-tab-add": undefined;
  "sheet-tab-delete": undefined;
  "sheet-tab-new": { n: string | number };
  "sheet-tab-plus": undefined;
  "sheet-tab-rename": undefined;
  "sheet-version-first": undefined;
  "sheet-version-imported": undefined;
  "skills-can-do": undefined;
  "skills-code": undefined;
  "skills-code-example": undefined;
  "skills-cook": undefined;
  "skills-cook-example": undefined;
  "skills-doc": undefined;
  "skills-doc-example": undefined;
  "skills-ledger": undefined;
  "skills-ledger-example": undefined;
  "skills-operate": undefined;
  "skills-operate-example": undefined;
  "skills-plan": undefined;
  "skills-plan-example": undefined;
  "skills-quote": { text: string | number };
  "skills-scene-computer": undefined;
  "skills-scene-cook": undefined;
  "skills-scene-docs": undefined;
  "skills-scene-life": undefined;
  "skills-scene-trip": undefined;
  "skills-search": undefined;
  "skills-sheet": undefined;
  "skills-sheet-example": undefined;
  "skills-slides": undefined;
  "skills-slides-example": undefined;
  "skills-tonight": undefined;
  "skills-tonight-example": undefined;
  "skills-tray": { title: string | number };
  "skills-tray-cancel": undefined;
  "skills-tray-send": undefined;
  "skills-trip": undefined;
  "skills-trip-change": undefined;
  "skills-trip-change-example": undefined;
  "skills-trip-example": undefined;
  "skills-try": undefined;
  "skills-weather": undefined;
  "skills-weather-example": undefined;
  "skills-week": undefined;
  "skills-week-example": undefined;
  "slides-act-reword": { part: string | number };
  "slides-act-shorter": { part: string | number };
  "slides-add": undefined;
  "slides-ask-page": { n: string | number; text: string | number };
  "slides-change-head": { n: string | number };
  "slides-change-new": { n: string | number };
  "slides-chart-bar": undefined;
  "slides-chart-line": undefined;
  "slides-chart-pie": undefined;
  "slides-chat-hint": undefined;
  "slides-chat-note": undefined;
  "slides-chat-placeholder": { n: string | number };
  "slides-context-label": { title: string | number };
  "slides-delete": undefined;
  "slides-duplicate": undefined;
  "slides-edit-body-hint": undefined;
  "slides-edit-hint": undefined;
  "slides-empty": undefined;
  "slides-export-note": undefined;
  "slides-export-pdf": undefined;
  "slides-export-pptx": undefined;
  "slides-format-pdf": undefined;
  "slides-format-png": undefined;
  "slides-format-pptx": undefined;
  "slides-highest": undefined;
  "slides-icon": undefined;
  "slides-image-add": undefined;
  "slides-image-change": undefined;
  "slides-image-note": undefined;
  "slides-image-placeholder": undefined;
  "slides-image-remove": undefined;
  "slides-image-search": undefined;
  "slides-keep": undefined;
  "slides-last-page": undefined;
  "slides-layout": undefined;
  "slides-layout-bullets": undefined;
  "slides-layout-chart": undefined;
  "slides-layout-compare": undefined;
  "slides-layout-flow": undefined;
  "slides-layout-funnel": undefined;
  "slides-layout-icons": undefined;
  "slides-layout-number": undefined;
  "slides-layout-quote": undefined;
  "slides-layout-section": undefined;
  "slides-layout-timeline": undefined;
  "slides-layout-title": undefined;
  "slides-layout-two": undefined;
  "slides-meta": { pages: string | number; theme: string | number };
  "slides-new-point": undefined;
  "slides-new-title": undefined;
  "slides-next": undefined;
  "slides-next-page": { title: string | number };
  "slides-no-notes": undefined;
  "slides-notes": undefined;
  "slides-notes-placeholder": undefined;
  "slides-open-powerpoint": undefined;
  "slides-pages": undefined;
  "slides-part-body": undefined;
  "slides-part-chart": undefined;
  "slides-part-image": undefined;
  "slides-part-subtitle": undefined;
  "slides-part-title": undefined;
  "slides-present": undefined;
  "slides-present-keys": undefined;
  "slides-present-progress": { n: string | number; time: string | number; total: string | number };
  "slides-reword": undefined;
  "slides-theme-blue": undefined;
  "slides-theme-green": undefined;
  "slides-theme-night": undefined;
  "slides-theme-note": undefined;
  "slides-theme-orange": undefined;
  "slides-top-meta": { pages: string | number; theme: string | number };
  "slides-transition": undefined;
  "slides-transition-fade": undefined;
  "slides-transition-none": undefined;
  "slides-transition-push": undefined;
  "slides-transition-zoom": undefined;
  "slides-undo": undefined;
  "slides-undo-new": undefined;
  "slides-version-first": undefined;
  "slides-versions-hint": undefined;
  "slides-writing": { n: string | number; total: string | number };
  "step-click": { detail: string | number };
  "step-click-plain": undefined;
  "step-confirm": { detail: string | number };
  "step-confirm-plain": undefined;
  "step-declined": undefined;
  "step-do_steps": { detail: string | number };
  "step-do_steps-plain": undefined;
  "step-edit_file": { detail: string | number };
  "step-edit_file-plain": undefined;
  "step-failed": undefined;
  "step-failed-page": undefined;
  "step-find_apps": { detail: string | number };
  "step-find_apps-plain": undefined;
  "step-find_threads": { detail: string | number };
  "step-find_threads-plain": undefined;
  "step-forget": { detail: string | number };
  "step-forget-plain": undefined;
  "step-found": { count: string | number; sources: string | number };
  "step-found-plain": { count: string | number };
  "step-generic": undefined;
  "step-gh": { detail: string | number };
  "step-gh-plain": undefined;
  "step-git": { detail: string | number };
  "step-git-plain": undefined;
  "step-history_outline": undefined;
  "step-history_read": undefined;
  "step-history_search": { detail: string | number };
  "step-history_search-plain": undefined;
  "step-list_dir": { detail: string | number };
  "step-list_dir-plain": undefined;
  "step-list_threads": undefined;
  "step-locate": undefined;
  "step-look_at_app": { detail: string | number };
  "step-look_at_app-plain": undefined;
  "step-matched": { names: string | number };
  "step-matched-none": undefined;
  "step-meet-hint": undefined;
  "step-meet-title": undefined;
  "step-message_subthread": undefined;
  "step-model-hint": undefined;
  "step-model-title": undefined;
  "step-open_app": { detail: string | number };
  "step-open_app-plain": undefined;
  "step-open_subthreads": undefined;
  "step-phone-hint": undefined;
  "step-phone-title": undefined;
  "step-press_keys": { detail: string | number };
  "step-press_keys-plain": undefined;
  "step-ran-failed": { code: string | number };
  "step-ran-ok": undefined;
  "step-ran-timeout": undefined;
  "step-read_file": { detail: string | number };
  "step-read_file-plain": undefined;
  "step-read_page": { detail: string | number };
  "step-read_page-plain": undefined;
  "step-read_thread": undefined;
  "step-recall": { detail: string | number };
  "step-recall-plain": undefined;
  "step-remember": { detail: string | number };
  "step-remember-plain": undefined;
  "step-run_command": { detail: string | number };
  "step-run_command-plain": undefined;
  "step-save_place_detail": { detail: string | number };
  "step-save_place_detail-plain": undefined;
  "step-save_trip": undefined;
  "step-saved": { version: string | number };
  "step-search_files": { detail: string | number };
  "step-search_files-plain": undefined;
  "step-sources-joiner": undefined;
  "step-spawn_agents": undefined;
  "step-thinking": undefined;
  "step-trust-hint": undefined;
  "step-trust-title": undefined;
  "step-type_text": { detail: string | number };
  "step-type_text-plain": undefined;
  "step-weather": { detail: string | number };
  "step-weather-plain": undefined;
  "step-web_search": { detail: string | number };
  "step-web_search-plain": undefined;
  "step-write_file": { detail: string | number };
  "step-write_file-plain": undefined;
  "subthread-cards-hint": undefined;
  "subthread-open-arrow": undefined;
  "subthread-report-label": { title: string | number };
  "subthread-report-rules": undefined;
  "subthread-report-title": { title: string | number };
  "subthread-task-label": { title: string | number };
  "subthread-task-rules": undefined;
  "tab-chats": undefined;
  "tab-daily": undefined;
  "tab-me": undefined;
  "tab-skills": undefined;
  "thinking-auto": undefined;
  "thinking-auto-help": undefined;
  "thinking-high": undefined;
  "thinking-high-help": undefined;
  "thinking-low": undefined;
  "thinking-low-help": undefined;
  "thinking-max": undefined;
  "thinking-max-help": undefined;
  "thinking-model": undefined;
  "thinking-none": undefined;
  "thinking-none-help": undefined;
  "thinking-title": undefined;
  "thinking-unsupported": undefined;
  "thread-empty": undefined;
  "thread-list-hint": undefined;
  "thread-menu-compact": undefined;
  "thread-new": undefined;
  "thread-new-shortcut": undefined;
  "thread-ref-hint": undefined;
  "thread-ref-pick": undefined;
  "thread-ref-remove": undefined;
  "thread-ref-title": { title: string | number };
  "thread-reference-label": { title: string | number };
  "thread-section-other": undefined;
  "thread-status-done": undefined;
  "thread-status-need": undefined;
  "thread-status-running": undefined;
  "thread-unread": undefined;
  "thread-untitled": undefined;
  "time-just-now": undefined;
  "time-yesterday": undefined;
  "timer-add": undefined;
  "timer-default-label": undefined;
  "timer-done": undefined;
  "timer-done-banner": { label: string | number };
  "timer-done-body": undefined;
  "timer-done-title": { label: string | number };
  "timer-extend": undefined;
  "timer-head": { count: string | number };
  "timer-hint": undefined;
  "timer-label": undefined;
  "timer-minutes": undefined;
  "timer-ok": undefined;
  "timer-start-short": undefined;
  "timer-then": { after: string | number };
  "tool-agent-task": undefined;
  "tool-agent-title": undefined;
  "tool-click-description": undefined;
  "tool-code-path": undefined;
  "tool-confirm-description": undefined;
  "tool-confirm-detail": undefined;
  "tool-confirm-title": undefined;
  "tool-cook-dishes": undefined;
  "tool-cook-minutes": undefined;
  "tool-cook-step-after": undefined;
  "tool-cook-step-dish": undefined;
  "tool-cook-step-heat": undefined;
  "tool-cook-step-seconds": undefined;
  "tool-cook-step-text": undefined;
  "tool-cook-step-tip": undefined;
  "tool-cook-steps-description": undefined;
  "tool-do-steps-description": undefined;
  "tool-do-steps-steps": undefined;
  "tool-do-steps-summary": undefined;
  "tool-doc-action": undefined;
  "tool-doc-after": undefined;
  "tool-doc-block-id": undefined;
  "tool-doc-edit-description": undefined;
  "tool-doc-heading": undefined;
  "tool-doc-id": undefined;
  "tool-doc-kind": undefined;
  "tool-doc-note": undefined;
  "tool-doc-op": undefined;
  "tool-doc-section-description": undefined;
  "tool-doc-sections": undefined;
  "tool-doc-start-description": undefined;
  "tool-doc-subtitle": undefined;
  "tool-doc-suggest-description": undefined;
  "tool-doc-text": undefined;
  "tool-doc-title": undefined;
  "tool-edit-file-all": undefined;
  "tool-edit-file-description": undefined;
  "tool-edit-file-new": undefined;
  "tool-edit-file-old": undefined;
  "tool-file-from": undefined;
  "tool-file-id": undefined;
  "tool-file-query": undefined;
  "tool-file-read-description": undefined;
  "tool-file-search-description": undefined;
  "tool-file-to": undefined;
  "tool-find-apps-description": undefined;
  "tool-find-apps-query": undefined;
  "tool-find-capability-description": undefined;
  "tool-find-capability-query": undefined;
  "tool-find-threads-description": undefined;
  "tool-find-threads-query": undefined;
  "tool-forget-description": undefined;
  "tool-forget-subject": undefined;
  "tool-gh-args": undefined;
  "tool-gh-description": undefined;
  "tool-git-args": undefined;
  "tool-git-description": undefined;
  "tool-history-at": undefined;
  "tool-history-outline-description": undefined;
  "tool-history-query": undefined;
  "tool-history-read-description": undefined;
  "tool-history-search-description": undefined;
  "tool-kitchen-avoid": undefined;
  "tool-kitchen-dish-minutes": undefined;
  "tool-kitchen-dish-missing": undefined;
  "tool-kitchen-dish-name": undefined;
  "tool-kitchen-dish-photo": undefined;
  "tool-kitchen-dish-uses": undefined;
  "tool-kitchen-dish-why": undefined;
  "tool-kitchen-dishes-description": undefined;
  "tool-kitchen-fridge-description": undefined;
  "tool-kitchen-fridge-items": undefined;
  "tool-kitchen-fridge-remove": undefined;
  "tool-kitchen-fridge-replace": undefined;
  "tool-kitchen-item-amount": undefined;
  "tool-kitchen-item-name": undefined;
  "tool-kitchen-max-minutes": undefined;
  "tool-kitchen-preferences-description": undefined;
  "tool-kitchen-servings": undefined;
  "tool-ledger-add-description": undefined;
  "tool-ledger-amount": undefined;
  "tool-ledger-budget-amount": undefined;
  "tool-ledger-budget-description": undefined;
  "tool-ledger-category": undefined;
  "tool-ledger-delete-description": undefined;
  "tool-ledger-edit-description": undefined;
  "tool-ledger-id": undefined;
  "tool-ledger-name": undefined;
  "tool-ledger-note": undefined;
  "tool-ledger-sort-description": undefined;
  "tool-ledger-sort-key": undefined;
  "tool-ledger-source": undefined;
  "tool-ledger-time": undefined;
  "tool-life-description": undefined;
  "tool-list-dir-depth": undefined;
  "tool-list-dir-description": undefined;
  "tool-list-threads-description": undefined;
  "tool-locate-description": undefined;
  "tool-look-at-app-description": undefined;
  "tool-message-subthread-description": undefined;
  "tool-message-subthread-text": undefined;
  "tool-name-apps": undefined;
  "tool-name-detail": undefined;
  "tool-name-locate": undefined;
  "tool-name-operate": undefined;
  "tool-name-page": undefined;
  "tool-name-remember": undefined;
  "tool-name-search": undefined;
  "tool-name-trip": undefined;
  "tool-name-weather": undefined;
  "tool-open-app-description": undefined;
  "tool-open-app-id": undefined;
  "tool-open-app-name": undefined;
  "tool-open-subthreads-description": undefined;
  "tool-open-subthreads-reason": undefined;
  "tool-operate-app": undefined;
  "tool-operate-app-name": undefined;
  "tool-operate-element": undefined;
  "tool-operate-label": undefined;
  "tool-page": undefined;
  "tool-plan-bounds": undefined;
  "tool-plan-changes": undefined;
  "tool-plan-description": undefined;
  "tool-plan-note": undefined;
  "tool-plan-output-id": undefined;
  "tool-plan-output-label": undefined;
  "tool-plan-question": undefined;
  "tool-plan-step": undefined;
  "tool-plan-step-detail": undefined;
  "tool-plan-step-due": undefined;
  "tool-plan-step-title": undefined;
  "tool-plan-title": undefined;
  "tool-press-keys-description": undefined;
  "tool-press-keys-keys": undefined;
  "tool-read-file-description": undefined;
  "tool-read-file-from": undefined;
  "tool-read-file-to": undefined;
  "tool-read-page-description": undefined;
  "tool-read-page-url": undefined;
  "tool-read-thread-description": undefined;
  "tool-read-thread-id": undefined;
  "tool-read-thread-page": undefined;
  "tool-recall-description": undefined;
  "tool-recall-galaxy": undefined;
  "tool-recall-query": undefined;
  "tool-remember-aliases": undefined;
  "tool-remember-category": undefined;
  "tool-remember-description": undefined;
  "tool-remember-expires": undefined;
  "tool-remember-galaxy": undefined;
  "tool-remember-importance": undefined;
  "tool-remember-kind": undefined;
  "tool-remember-pinned": undefined;
  "tool-remember-replaces": undefined;
  "tool-remember-subject": undefined;
  "tool-remember-value": undefined;
  "tool-run-command-command": undefined;
  "tool-run-command-description": undefined;
  "tool-run-command-reason": undefined;
  "tool-save-place-detail-day": undefined;
  "tool-save-place-detail-description": undefined;
  "tool-save-place-detail-stop": undefined;
  "tool-save-trip-city": undefined;
  "tool-save-trip-cost": undefined;
  "tool-save-trip-day-change": undefined;
  "tool-save-trip-day-date": undefined;
  "tool-save-trip-description": undefined;
  "tool-save-trip-detail-duration": undefined;
  "tool-save-trip-detail-quiet": undefined;
  "tool-save-trip-detail-reviews": undefined;
  "tool-save-trip-detail-suits": undefined;
  "tool-save-trip-detail-tickets": undefined;
  "tool-save-trip-detail-why": undefined;
  "tool-save-trip-needs": undefined;
  "tool-save-trip-next-minutes": undefined;
  "tool-save-trip-next-mode": undefined;
  "tool-save-trip-party": undefined;
  "tool-save-trip-reminder": undefined;
  "tool-save-trip-review-text": undefined;
  "tool-save-trip-source-date": undefined;
  "tool-save-trip-source-title": undefined;
  "tool-save-trip-source-url": undefined;
  "tool-save-trip-stop-detail": undefined;
  "tool-save-trip-stop-name": undefined;
  "tool-save-trip-stop-note": undefined;
  "tool-save-trip-stop-time": undefined;
  "tool-save-trip-title": undefined;
  "tool-save-trip-update": undefined;
  "tool-search-files-description": undefined;
  "tool-search-files-names": undefined;
  "tool-search-files-query": undefined;
  "tool-sheet-cell": undefined;
  "tool-sheet-create-description": undefined;
  "tool-sheet-edit-description": undefined;
  "tool-sheet-op": undefined;
  "tool-sheet-range": undefined;
  "tool-sheet-rows": undefined;
  "tool-sheet-tab": undefined;
  "tool-sheet-title": undefined;
  "tool-shopping-add-description": undefined;
  "tool-shopping-note": undefined;
  "tool-skill-read-description": undefined;
  "tool-skill-read-name": undefined;
  "tool-slides-chart": undefined;
  "tool-slides-columns": undefined;
  "tool-slides-deck-id": undefined;
  "tool-slides-edit-description": undefined;
  "tool-slides-image": undefined;
  "tool-slides-items": undefined;
  "tool-slides-layout": undefined;
  "tool-slides-notes": undefined;
  "tool-slides-op": undefined;
  "tool-slides-page-description": undefined;
  "tool-slides-page-number": undefined;
  "tool-slides-page-title": undefined;
  "tool-slides-pages": undefined;
  "tool-slides-start-description": undefined;
  "tool-slides-subtitle": undefined;
  "tool-slides-theme": undefined;
  "tool-slides-title": undefined;
  "tool-spawn-agents-description": undefined;
  "tool-subthread-task": undefined;
  "tool-subthread-title": undefined;
  "tool-type-text-description": undefined;
  "tool-type-text-text": undefined;
  "tool-weather-days": undefined;
  "tool-weather-description": undefined;
  "tool-weather-place": undefined;
  "tool-web-search-description": undefined;
  "tool-web-search-query": undefined;
  "tool-week-buy": undefined;
  "tool-week-day-date": undefined;
  "tool-week-day-dish": undefined;
  "tool-week-day-takeout": undefined;
  "tool-week-day-why": undefined;
  "tool-week-days": undefined;
  "tool-week-idea": undefined;
  "tool-week-item-group": undefined;
  "tool-week-item-have": undefined;
  "tool-week-item-note": undefined;
  "tool-week-keep": undefined;
  "tool-week-plan-description": undefined;
  "tool-week-prep": undefined;
  "tool-week-prep-text": undefined;
  "tool-week-prep-time": undefined;
  "tool-week-start": undefined;
  "tool-write-file-content": undefined;
  "tool-write-file-description": undefined;
  "trace-joiner": undefined;
  "trace-summary": { count: string | number; names: string | number };
  "trip-amap-food": { place: string | number };
  "trip-back": { title: string | number };
  "trip-back-latest": undefined;
  "trip-calendar-name": undefined;
  "trip-card-meta": { party: string | number; range: string | number };
  "trip-connect-search": undefined;
  "trip-context-body": { title: string | number; version: string | number };
  "trip-context-label": undefined;
  "trip-copy-family": undefined;
  "trip-copy-footer": undefined;
  "trip-copy-stop": { name: string | number; note: string | number; time: string | number };
  "trip-cost": { cost: string | number };
  "trip-day": { n: string | number };
  "trip-leg": { minutes: string | number; mode: string | number };
  "trip-leg-estimated": { minutes: string | number; mode: string | number };
  "trip-loading": undefined;
  "trip-mode-taxi": undefined;
  "trip-mode-transit": undefined;
  "trip-mode-walk": undefined;
  "trip-month-day": { day: string | number; month: string | number };
  "trip-nearby-food": undefined;
  "trip-old-version": { time: string | number };
  "trip-open": undefined;
  "trip-open-amap": undefined;
  "trip-range": { from: string | number; to: string | number };
  "trip-reminder": { text: string | number };
  "trip-revise": undefined;
  "trip-revise-quote": { range: string | number; title: string | number };
  "trip-route": undefined;
  "trip-say": undefined;
  "trip-say-placeholder": undefined;
  "trip-send": undefined;
  "trip-sky-clear": undefined;
  "trip-sky-cloudy": undefined;
  "trip-sky-fog": undefined;
  "trip-sky-heavy_rain": undefined;
  "trip-sky-light_rain": undefined;
  "trip-sky-overcast": undefined;
  "trip-sky-rain": undefined;
  "trip-sky-snow": undefined;
  "trip-sky-storm": undefined;
  "trip-stops-joiner": undefined;
  "trip-stops-more": { count: string | number; stops: string | number };
  "trip-sync-calendar": undefined;
  "trip-toast-amap": undefined;
  "trip-toast-calendar": { count: string | number };
  "trip-toast-calendar-denied": undefined;
  "trip-toast-calendar-failed": undefined;
  "trip-toast-calendar-handed": { count: string | number };
  "trip-toast-calendar-open": undefined;
  "trip-toast-calendar-retry": undefined;
  "trip-toast-calendar-settings": undefined;
  "trip-toast-copied": undefined;
  "trip-unverified": undefined;
  "trip-unverified-lead": { text: string | number };
  "trip-updated": undefined;
  "trip-view-version": undefined;
  "trip-weather-rain": { chance: string | number; sky: string | number };
  "trip-weather-range": { high: string | number; low: string | number; sky: string | number };
  "trip-weekday-0": undefined;
  "trip-weekday-1": undefined;
  "trip-weekday-2": undefined;
  "trip-weekday-3": undefined;
  "trip-weekday-4": undefined;
  "trip-weekday-5": undefined;
  "trip-weekday-6": undefined;
  "trust-balanced-desc": undefined;
  "trust-balanced-example": undefined;
  "trust-balanced-name": undefined;
  "trust-cautious-desc": undefined;
  "trust-cautious-example": undefined;
  "trust-cautious-name": undefined;
  "trust-hands-off-desc": undefined;
  "trust-hands-off-example": undefined;
  "trust-hands-off-name": undefined;
  "trust-heading": undefined;
  "trust-lead": undefined;
  "trust-red-lines": undefined;
  "turn-regenerate": undefined;
  "versions-count": { current: string | number; total: string | number };
  "versions-next": undefined;
  "versions-previous": undefined;
  "viewer-close": undefined;
  "viewer-copied": undefined;
  "viewer-copy": undefined;
  "viewer-failed": undefined;
  "viewer-next": undefined;
  "viewer-open": { name: string | number };
  "viewer-open-page": { site: string | number };
  "viewer-preview": undefined;
  "viewer-previous": undefined;
  "viewer-save": undefined;
  "viewer-saved": undefined;
  "voice-cancel": undefined;
  "voice-cancel-key": undefined;
  "voice-denied-microphone": undefined;
  "voice-denied-speech": undefined;
  "voice-dictation-off": undefined;
  "voice-done": undefined;
  "voice-hint": { shortcut: string | number };
  "voice-listening": undefined;
  "voice-open-settings": undefined;
  "voice-shortcut": undefined;
  "voice-start": { shortcut: string | number };
  "voice-unavailable": undefined;
  "weather-add": undefined;
  "weather-add-go": undefined;
  "weather-add-label": undefined;
  "weather-add-note": undefined;
  "weather-add-short": undefined;
  "weather-add-tab": undefined;
  "weather-air": undefined;
  "weather-air-tag": { level: string | number; value: string | number };
  "weather-alert-rain": undefined;
  "weather-alert-rain-body": {
    chance: string | number;
    hour: string | number;
    peak: string | number;
  };
  "weather-alert-raining": undefined;
  "weather-alert-summary": { high: string | number; low: string | number; sky: string | number };
  "weather-aqi": { level: string | number; value: string | number };
  "weather-aqi-1": undefined;
  "weather-aqi-2": undefined;
  "weather-aqi-3": undefined;
  "weather-aqi-4": undefined;
  "weather-aqi-5": undefined;
  "weather-aqi-6": undefined;
  "weather-city-placeholder": undefined;
  "weather-days": undefined;
  "weather-degrees": { value: string | number };
  "weather-failed": undefined;
  "weather-fri": undefined;
  "weather-home": undefined;
  "weather-hour": { hour: string | number };
  "weather-hour-short": { hour: string | number };
  "weather-hours": undefined;
  "weather-hours-note": undefined;
  "weather-hours-swipe": undefined;
  "weather-loading": undefined;
  "weather-locate": undefined;
  "weather-menu-here": undefined;
  "weather-menu-home-note": undefined;
  "weather-menu-located": undefined;
  "weather-menu-make-home": undefined;
  "weather-menu-move": undefined;
  "weather-menu-name": undefined;
  "weather-menu-remove": undefined;
  "weather-menu-searched": undefined;
  "weather-menu-where": undefined;
  "weather-mon": undefined;
  "weather-none": undefined;
  "weather-none-failed": undefined;
  "weather-now": undefined;
  "weather-now-line": { feels: string | number; sky: string | number };
  "weather-percent": { value: string | number };
  "weather-place": { city: string | number; label: string | number };
  "weather-place-active": { name: string | number };
  "weather-place-placeholder": undefined;
  "weather-range": { high: string | number; low: string | number };
  "weather-rhythm": { end: string | number; start: string | number };
  "weather-rhythm-fixed": undefined;
  "weather-rhythm-follow": undefined;
  "weather-rhythm-learning": undefined;
  "weather-rhythm-make-fixed": undefined;
  "weather-rhythm-unsupported": undefined;
  "weather-rule-air": undefined;
  "weather-rule-air-note": undefined;
  "weather-rule-cold": undefined;
  "weather-rule-cold-fixed": undefined;
  "weather-rule-cold-note": undefined;
  "weather-rule-rain": undefined;
  "weather-rule-rain-fixed": undefined;
  "weather-rule-rain-note": undefined;
  "weather-rule-today": undefined;
  "weather-rule-today-fixed": undefined;
  "weather-rule-today-note": undefined;
  "weather-rules": undefined;
  "weather-rules-link": undefined;
  "weather-sat": undefined;
  "weather-sky-clear": undefined;
  "weather-sky-cloudy": undefined;
  "weather-sky-fog": undefined;
  "weather-sky-heavy-rain": undefined;
  "weather-sky-light-rain": undefined;
  "weather-sky-overcast": undefined;
  "weather-sky-rain": undefined;
  "weather-sky-range": { high: string | number; low: string | number; sky: string | number };
  "weather-sky-snow": undefined;
  "weather-sky-storm": undefined;
  "weather-sun": undefined;
  "weather-sun-times": undefined;
  "weather-sunset": { time: string | number };
  "weather-thu": undefined;
  "weather-tip-air": { aqi: string | number };
  "weather-tip-air-detail": undefined;
  "weather-tip-cold": { drop: string | number };
  "weather-tip-cold-detail": { high: string | number; low: string | number };
  "weather-tip-rain": { chance: string | number; hour: string | number };
  "weather-tip-rain-peak": { chance: string | number; hour: string | number };
  "weather-tip-sun": { day: string | number };
  "weather-tip-sun-detail": undefined;
  "weather-tips": undefined;
  "weather-title": undefined;
  "weather-today": undefined;
  "weather-tue": undefined;
  "weather-updated": { time: string | number };
  "weather-use-here": undefined;
  "weather-use-here-where": { place: string | number };
  "weather-uv": undefined;
  "weather-uv-1": undefined;
  "weather-uv-2": undefined;
  "weather-uv-3": undefined;
  "weather-uv-4": undefined;
  "weather-uv-5": undefined;
  "weather-wed": undefined;
  "week-buy": { count: string | number };
  "week-buy-add": undefined;
  "week-buy-added": undefined;
  "week-buy-note": undefined;
  "week-changed": undefined;
  "week-chat-placeholder": undefined;
  "week-day-label": { date: string | number; weekday: string | number };
  "week-empty-body": undefined;
  "week-empty-hint": undefined;
  "week-empty-start": undefined;
  "week-empty-title": undefined;
  "week-fill": undefined;
  "week-fill-message": { day: string | number };
  "week-gone": undefined;
  "week-gone-hint": undefined;
  "week-gone-message": { name: string | number };
  "week-have": undefined;
  "week-idea": undefined;
  "week-next": undefined;
  "week-plan-message": { range: string | number; start: string | number };
  "week-prep": undefined;
  "week-prep-item": { day: string | number; text: string | number; time: string | number };
  "week-prep-note": undefined;
  "week-prev": undefined;
  "week-replan": undefined;
  "week-replan-message": { range: string | number; start: string | number };
  "week-subtitle": { minutes: string | number; range: string | number };
  "week-swap": undefined;
  "week-swap-message": { day: string | number; dish: string | number };
  "week-swap-short": undefined;
  "week-tab-menu": undefined;
  "week-tab-shopping": { count: string | number };
  "week-title-next": undefined;
  "week-title-other": undefined;
  "week-title-this": undefined;
  "week-today": undefined;
  "working-show-steps": undefined;
  "workspace-add": undefined;
  "workspace-drop": { name: string | number };
  "workspace-label": undefined;
  "workspace-memories": undefined;
  "workspace-memories-empty": undefined;
  "workspace-memories-hint": undefined;
  "workspace-memory": { subject: string | number; value: string | number };
  "workspace-more": undefined;
  "workspace-more-threads": { count: string | number };
  "workspace-new-choose": undefined;
  "workspace-new-empty": undefined;
  "workspace-new-git": { branch: string | number };
  "workspace-new-hint": undefined;
  "workspace-new-no-git": undefined;
  "workspace-new-no-repo": undefined;
  "workspace-new-start": undefined;
  "workspace-new-thread": undefined;
  "workspace-new-thread-in": undefined;
  "workspace-new-title": undefined;
  "workspace-open": undefined;
  "workspace-outputs": undefined;
  "workspace-phone": undefined;
  "workspace-phone-connect": undefined;
  "workspace-phone-connected": undefined;
  "workspace-phone-none": undefined;
  "workspace-phone-none-hint": undefined;
  "workspace-remove": undefined;
  "workspace-remove-body": undefined;
  "workspace-remove-title": { name: string | number };
  "workspace-rule-ask": undefined;
  "workspace-rule-inside": undefined;
  "workspace-rule-undo": undefined;
  "workspace-section": undefined;
  "workspace-settings": undefined;
  "workspace-settings-commands": undefined;
  "workspace-settings-commands-hint": undefined;
  "workspace-settings-done": undefined;
  "workspace-settings-editor": undefined;
  "workspace-settings-editor-auto": undefined;
  "workspace-settings-editor-hint": undefined;
  "workspace-settings-editor-system": undefined;
  "workspace-settings-name": undefined;
  "workspace-settings-none": undefined;
  "workspace-settings-place": undefined;
  "workspace-settings-place-hint": undefined;
  "workspace-settings-read": undefined;
  "workspace-settings-remove": undefined;
  "workspace-settings-title": undefined;
  "workspace-settings-write": undefined;
  "workspace-settings-write-hint": undefined;
  "workspace-trip": { count: string | number; range: string | number };
}
