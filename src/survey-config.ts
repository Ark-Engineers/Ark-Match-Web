export type StepType = 'select' | 'multi-select' | 'text' | 'contacts' | 'birth' | 'rank'

export interface SurveyStep {
  key: string
  title: string
  subtitle?: string
  type: StepType
  options?: { key: string; label: string; desc?: string }[]
  placeholder?: string
  maxLength?: number
  optional?: boolean
  tracks: ('friend' | 'love')[]
  condition?: { dependsOn: string; value: string }
  conditionalSteps?: SurveyStep[]
}

const genderStep: SurveyStep = {
  key: 'gender', title: '你的性别', type: 'select',
  tracks: ['friend', 'love'],
  options: [
    { key: 'MALE', label: '男' },
    { key: 'FEMALE', label: '女' },
    { key: 'OTHER', label: '其他' },
  ],
}

const matchGenderFriendStep: SurveyStep = {
  key: 'matchGender', title: '更希望匹配到？', type: 'select',
  tracks: ['friend'],
  options: [
    { key: 'MALE', label: '男' },
    { key: 'FEMALE', label: '女' },
    { key: 'ANY', label: '我不在乎' },
  ],
}

const matchGenderLoveStep: SurveyStep = {
  key: 'matchGender', title: '希望匹配的性别？', type: 'select',
  tracks: ['love'],
  options: [
    { key: 'MALE', label: '男' },
    { key: 'FEMALE', label: '女' },
    { key: 'PRIVATE', label: '不愿透露' },
  ],
}

const contactsStep: SurveyStep = {
  key: 'contacts', title: '联系方式', type: 'contacts',
  subtitle: '至少填写一项，匹配成功后将展示给对方',
  tracks: ['friend', 'love'],
}

const birthStep: SurveyStep = {
  key: 'birth', title: '出生年月', type: 'birth',
  subtitle: '年份必填，月份选填',
  tracks: ['friend', 'love'],
}

const statusStep: SurveyStep = {
  key: 'status', title: '目前状态', type: 'select',
  tracks: ['friend', 'love'],
  options: [
    { key: 'STUDENT', label: '在读学生' },
    { key: 'JOB_SEEKING', label: '应届求职中' },
    { key: 'WORKING', label: '已工作' },
    { key: 'GAP', label: 'Gap或调整期' },
    { key: 'PRIVATE', label: '暂不透露' },
  ],
}

const meetIntentStep: SurveyStep = {
  key: 'meetIntent', title: '见面意向', type: 'select',
  subtitle: '你希望和匹配对象见面吗？',
  tracks: ['friend', 'love'],
  options: [
    { key: 'ONLINE_ONLY', label: '止于线上聊天就好' },
    { key: 'WILLING_TO_MEET', label: '如果相处起来还不错，我会希望见面' },
  ],
  conditionalSteps: [
    {
      key: 'locations', title: '常驻地区', type: 'text',
      subtitle: '精确到城市（可添加假期情况）',
      tracks: ['friend', 'love'],
      condition: { dependsOn: 'meetIntent', value: 'WILLING_TO_MEET' },
      placeholder: '如：上海（常住）/ 南京（寒暑假）',
    },
    {
      key: 'meetRange', title: '活动范围', type: 'select',
      tracks: ['friend', 'love'],
      condition: { dependsOn: 'meetIntent', value: 'WILLING_TO_MEET' },
      options: [
        { key: 'same_city', label: '同城' },
        { key: 'same_province', label: '同省' },
        { key: 'adjacent', label: '相邻省份' },
        { key: 'nationwide', label: '全国' },
        { key: 'international', label: '跨国也可以' },
      ],
    },
    {
      key: 'meetFrequency', title: '期望见面频次', type: 'select',
      tracks: ['friend', 'love'],
      condition: { dependsOn: 'meetIntent', value: 'WILLING_TO_MEET' },
      options: [
        { key: 'weekly', label: '每周至少一次' },
        { key: 'monthly', label: '每月一两次' },
        { key: 'quarterly', label: '每季度一两次' },
        { key: 'semiannually', label: '半年一次' },
        { key: 'yearly', label: '一年一次也OK' },
        { key: 'casual', label: '随缘，不设预期' },
      ],
    },
  ],
}

const serversStep: SurveyStep = {
  key: 'servers', title: '你在哪个服务器玩？', type: 'multi-select',
  tracks: ['friend', 'love'],
  options: [
    { key: 'official', label: '官服' },
    { key: 'bilibili', label: 'B服' },
    { key: 'overseas', label: '海外服' },
  ],
}

const battleStyleStep: SurveyStep = {
  key: 'battleStyle', title: '关卡战斗风格', type: 'select',
  subtitle: '挑战新活动/主线关卡时，你更倾向于？',
  tracks: ['friend', 'love'],
  options: [
    { key: 'self_clear', label: '全程自行通关' },
    { key: 'copy', label: '抄作业' },
    { key: 'self_then_copy', label: '尽量自己打，打不过了再抄' },
    { key: 'ask_friends', label: '打不过也不抄，问群友/拜托亲友' },
  ],
}

const storyStep: SurveyStep = {
  key: 'storyDepth', title: '剧情投入度', type: 'select',
  tracks: ['friend', 'love'],
  options: [
    { key: 'full', label: '每期都认真看完' },
    { key: 'skip', label: '挑感兴趣的看' },
    { key: 'via_others', label: '基本跳过，看别人总结' },
    { key: 'dont_care', label: '不怎么关心剧情' },
  ],
}

const playerTagsStep: SurveyStep = {
  key: 'playerTags', title: '你是什么类型的博士？', type: 'multi-select',
  subtitle: '可多选',
  tracks: ['friend', 'love'],
  options: [
    { key: 'hamster', label: '囤囤鼠' },
    { key: 'meta', label: '强度党' },
    { key: 'waifu', label: 'XP党' },
    { key: 'roguelike', label: '集批' },
    { key: 'fortification', label: '卫批' },
    { key: 'gacha', label: '吃谷' },
    { key: 'cosplay', label: '出cos' },
    { key: 'fanwork', label: '搞二创' },
    { key: 'offline_event', label: '去舟o、去音律' },
  ],
}

const favoriteOpsStep: SurveyStep = {
  key: 'favoriteOps', title: '你最喜欢的干员', type: 'text',
  subtitle: '填写干员名，多个以中文逗号隔开，最多9位',
  tracks: ['friend', 'love'], optional: true,
  placeholder: '如：阿米娅，凯尔希，陈',
}

const wantToDoStep: SurveyStep = {
  key: 'wantToDo', title: '希望和匹配对象一起？', type: 'multi-select',
  tracks: ['friend', 'love'],
  options: [
    { key: 'add_friend', label: '加个游戏好友' },
    { key: 'chat_lore', label: '聊剧情、分析世界观' },
    { key: 'share_fanwork', label: '分享二创、聊周边' },
    { key: 'offline_shop', label: '一起线下逛谷店/逛展' },
    { key: 'cosplay_shoot', label: '一起出cos拍团片' },
    { key: 'casual', label: '随缘，不一定在游戏内有交集' },
  ],
}

const otherGamesStep: SurveyStep = {
  key: 'otherGames', title: '其他在玩的游戏', type: 'text',
  subtitle: '请填写官方中文名称，多个游戏之间以中文逗号隔开',
  tracks: ['friend', 'love'],
  placeholder: '如：终末地，原神，崩坏：星穹铁道',
}

const recentMediaStep: SurveyStep = {
  key: 'recentMedia', title: '最近在看', type: 'text',
  subtitle: '动画/剧/书/漫画，多个作品之间以中文逗号隔开',
  tracks: ['friend', 'love'],
  placeholder: '如：迷宫饭，葬送的芙莉莲',
}

const passionsStep: SurveyStep = {
  key: 'passions', title: '聊不完的事', type: 'text',
  subtitle: '有什么兴趣爱好，随时被人提起、不经准备就能聊上好几个小时？',
  tracks: ['friend', 'love'],
  placeholder: '自由填写',
}

// LOVE-only steps
const loveSecurityStep: SurveyStep = {
  key: 'securityType', title: '你想从关系中获得的最重要的东西是？', type: 'select',
  tracks: ['love'],
  options: [
    { key: 'infected', label: '感染者聚落的相守', desc: '相互依偎抱团取暖。代价：面对现实难题时能力有限' },
    { key: 'karland', label: '喀兰贸易的可靠', desc: '话不多但靠得住。代价：不擅长表达情绪，你很难知道对方在想什么' },
    { key: 'penguin', label: '企鹅物流的自由', desc: '轻松愉快，能一起嗨也能各自精彩。代价：特别需要TA时TA可能在外地送货' },
    { key: 'rhine', label: '莱茵生命的并肩', desc: '各自成长互相托举。代价：成长速度落后容易成为被优化的同事' },
  ],
}

const loveCrushStep: SurveyStep = {
  key: 'crushStyle', title: '暗恋时，你最可能会？', type: 'select',
  tracks: ['love'],
  options: [
    { key: 'direct', label: '直球出击，不搞暧昧' },
    { key: 'stalk', label: '把对方空间动态翻到三年前' },
    { key: 'coincidence', label: '精心设计偶遇机会' },
    { key: 'rewrite', label: '一句话打了又删，删了又打' },
    { key: 'no_contact', label: '我怎么可能加上暗恋对象的联系方式？' },
  ],
}

const loveFirstDateStep: SurveyStep = {
  key: 'firstDate', title: '第一次和对方见面时，你更想？', type: 'select',
  tracks: ['love'],
  options: [
    { key: 'exhibition', label: '一起逛展/看电影' },
    { key: 'food', label: '找家好吃的店约饭' },
    { key: 'walk', label: '闲逛，边走边聊' },
    { key: 'game', label: '不敢见面，还是一起打游戏吧' },
  ],
}

const loveNoReplyStep: SurveyStep = {
  key: 'noReplyReaction', title: '对方一整天没回消息，你？', type: 'select',
  tracks: ['love'],
  options: [
    { key: 'wait', label: '猜测对方应该在忙，接着等' },
    { key: 'review', label: '翻聊天记录，看看自己是不是说错话了' },
    { key: 'call', label: '直接问，还不回就打电话' },
    { key: 'breakup', label: '分手进度累积吧累积吧' },
  ],
}

const loveFightStep: SurveyStep = {
  key: 'fightStyle', title: '吵架了，你最可能会', type: 'select',
  tracks: ['love'],
  options: [
    { key: 'confront', label: '当场吵出个结果' },
    { key: 'cool_down', label: '先冷静，冷静下来以后再沟通' },
    { key: 'comfort_first', label: '先把对方情绪哄好，具体的事情之后再说' },
    { key: 'mutual_friend', label: '找双方的共友评理/说和，然后再决定下一步' },
    { key: 'vent', label: '向自己的朋友/闺蜜吐槽，然后再决定下一步' },
    { key: 'cry', label: '不会吵架，我就这样一直哭......' },
  ],
}

const loveSignalStep: SurveyStep = {
  key: 'loveSignal', title: '对方做什么会让你觉得Ta特别爱你？', type: 'select',
  tracks: ['love'],
  options: [
    { key: 'quick_reply', label: '已在工位，消息秒回' },
    { key: 'remember_details', label: '你随口提到的小事Ta都记得，且认真对待' },
    { key: 'care', label: '生病或受伤时的悉心照顾' },
    { key: 'ritual', label: '生日/纪念日时的仪式感' },
    { key: 'steel_heart', label: '我心如钢铁，难以被打动' },
  ],
}

const loveDealBreakersStep: SurveyStep = {
  key: 'dealBreakers', title: '你最不能接受对方？', type: 'rank',
  subtitle: '按最不能接受的顺序排列（全部排序）',
  tracks: ['love'],
  options: [
    { key: 'ex_contact', label: '与前任保持联系' },
    { key: 'social_flirt', label: '玩社交软件暧昧养鱼' },
    { key: 'major_decision', label: '重大决定（出国/考研/辞职）不商量' },
    { key: 'public_mock', label: '在朋友面前频繁吐槽你' },
    { key: 'hide_finance', label: '对你隐瞒自己的经济状况' },
  ],
}

const longTermStep: SurveyStep = {
  key: 'longTermView', title: '长远规划', type: 'select',
  subtitle: '有人通过类似平台不仅找到了伴侣，两人还认真规划过共同的未来。对于这种情况，你——',
  tracks: ['love'],
  options: [
    { key: 'yes', label: '如果遇到合适的人，我也会认真考虑长远的事' },
    { key: 'no', label: '我暂时没想那么远' },
  ],
  conditionalSteps: [
    {
      key: 'futureCity', title: '关于未来在哪座城市生活', type: 'select',
      tracks: ['love'],
      condition: { dependsOn: 'longTermView', value: 'yes' },
      options: [
        { key: 'fixed', label: '我有明确目标城市，伴侣最好同行' },
        { key: 'exploring', label: '我还在探索，愿意为好的机会或伴侣调整' },
        { key: 'anywhere', label: '随遇而安，更看重生活质量和氛围' },
      ],
      conditionalSteps: [
        {
          key: 'targetCity', title: '目标城市与职业', type: 'text',
          tracks: ['love'],
          condition: { dependsOn: 'futureCity', value: 'fixed' },
          placeholder: '如：上海·互联网行业',
        },
      ],
    },
    {
      key: 'selfEconRole', title: '你对自己未来经济角色的期待是？', type: 'select',
      tracks: ['love'],
      condition: { dependsOn: 'longTermView', value: 'yes' },
      options: [
        { key: 'max', label: '【马克维茨】梦想是电表倒转，经济越高越好' },
        { key: 'domestic', label: '【罗素】侧重家庭内务/生活管理，搞钱的事交给队友' },
        { key: 'mlynar', label: '【玛恩纳】普通的上班族，薪水不高不低，假期不多不少' },
        { key: 'spiritual', label: '物质过得去就可以，更看重精神和生活上是否合拍' },
      ],
    },
    {
      key: 'partnerEconRole', title: '你对伴侣经济角色的期待', type: 'select',
      tracks: ['love'],
      condition: { dependsOn: 'longTermView', value: 'yes' },
      options: [
        { key: 'max', label: '【马克维茨】梦想是电表倒转，经济越高越好' },
        { key: 'domestic', label: '【罗素】侧重家庭内务/生活管理，搞钱的事交给队友' },
        { key: 'mlynar', label: '【玛恩纳】普通的上班族，薪水不高不低，假期不多不少' },
        { key: 'spiritual', label: '物质过得去就可以，更看重精神和生活上是否合拍' },
      ],
    },
    {
      key: 'familyView', title: '当一段关系走向长期时，你如何看待双方家庭？', type: 'select',
      tracks: ['love'],
      condition: { dependsOn: 'longTermView', value: 'yes' },
      options: [
        { key: 'independent', label: '尽量不依靠父母，我们的未来自己决定' },
        { key: 'accept_help', label: '接受原生家庭的助力（如购房首付、购车），听从长辈的建议' },
        { key: 'caregiving', label: '家里有些事需要我照顾，希望对方理解和共同分担' },
      ],
    },
    {
      key: 'dowryView', title: '假设你和伴侣走到了谈婚论嫁这一步，关于彩礼/嫁妆', type: 'select',
      tracks: ['love'],
      condition: { dependsOn: 'longTermView', value: 'yes' },
      options: [
        { key: 'traditional', label: '按习俗来，该有的仪式走一下，数字量力而行' },
        { key: 'negotiate', label: '双方家庭坐下来坦诚谈，各自说明能承担什么' },
        { key: 'reject', label: '我不认同这套传统，希望跳过这些，直接进入两个人的生活' },
      ],
    },
  ],
}

export function getSteps(track: 'friend' | 'love'): SurveyStep[] {
  const allSteps: SurveyStep[] = [
    genderStep,
    track === 'friend' ? matchGenderFriendStep : matchGenderLoveStep,
    { key: 'nickname', title: '对方怎么称呼你？', type: 'text', tracks: ['friend', 'love'], placeholder: '你的昵称', maxLength: 30 },
    contactsStep,
    birthStep,
    statusStep,
    meetIntentStep,
    serversStep,
    battleStyleStep,
    storyStep,
    playerTagsStep,
    favoriteOpsStep,
    wantToDoStep,
    otherGamesStep,
    recentMediaStep,
    passionsStep,
  ]

  if (track === 'love') {
    allSteps.push(
      loveSecurityStep, loveCrushStep, loveFirstDateStep,
      loveNoReplyStep, loveFightStep, loveSignalStep,
      loveDealBreakersStep, longTermStep,
    )
  }

  return allSteps.filter(s => s.tracks.includes(track))
}

export function flattenSteps(steps: SurveyStep[], answers: Record<string, unknown>): SurveyStep[] {
  const result: SurveyStep[] = []
  for (const step of steps) {
    result.push(step)
    if (step.conditionalSteps) {
      for (const condStep of step.conditionalSteps) {
        if (condStep.condition && answers[condStep.condition.dependsOn] === condStep.condition.value) {
          result.push(condStep)
          if (condStep.conditionalSteps) {
            for (const sub of condStep.conditionalSteps) {
              if (sub.condition && answers[sub.condition.dependsOn] === sub.condition.value) {
                result.push(sub)
              }
            }
          }
        }
      }
    }
  }
  return result
}