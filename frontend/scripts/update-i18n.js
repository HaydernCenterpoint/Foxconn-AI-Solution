import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const enPath = path.join(root, 'src/app/i18n/en/index.ts');
const zhPath = path.join(root, 'src/app/i18n/zh-CN/index.ts');

function updateEn() {
  let content = fs.readFileSync(enPath, 'utf8').replace(/\r\n/g, '\n');

  // Replace common.actions
  content = content.replace(
    `      zoomOut: 'Zoom out',
    },`,
    `      zoomOut: 'Zoom out',
      approve: 'Approve',
      revoke: 'Revoke',
      back: 'Back',
      pending: 'Pending...',
    },`
  );

  // Replace common.status
  content = content.replace(
    `      backendOnlineHint: 'Backend is responding',
      backendOfflineHint: 'Cannot reach the backend',
    },`,
    `      backendOnlineHint: 'Backend is responding',
      backendOfflineHint: 'Cannot reach the backend',
      noData: 'No data',
    },`
  );

  // Replace common end
  content = content.replace(
    `    notifications: {
      title: 'Notifications',
      empty: 'No notifications',
      markAllRead: 'Mark all as read',
    },
  },`,
    `    notifications: {
      title: 'Notifications',
      empty: 'No notifications',
      markAllRead: 'Mark all as read',
    },
    all: 'All',
    error: 'Error',
    success: 'Success',
    filter: 'Filter',
    uph: 'UPH Speed',
    viewerMode: 'Viewer Mode',
    guest: 'Guest',
    minuteName: 'minute',
    confirm: {
      delete: 'Are you sure you want to delete?',
    },
    table: {
      noData: 'No data in table',
    },
    errors: {
      errorCode: 'Detected error code',
      unknown: 'An unknown error occurred.',
    },
  },`
  );

  // Replace dashboard end
  content = content.replace(
    `    deviceLineNames: 'Line: {{lines}}',
  },`,
    `    deviceLineNames: 'Line: {{lines}}',
    alarmsLogs: 'Alarm logs',
  },`
  );

  // Replace dashboard end to insert root-level kpi
  content = content.replace(
    `    alarmsLogs: 'Alarm logs',
  },
  lines: {`,
    `    alarmsLogs: 'Alarm logs',
  },
  kpi: {
    activeAlarms: 'Total Alarms',
  },
  lines: {`
  );

  // Replace settings.appearance
  content = content.replace(
    `      reducedMotion: 'Reduced motion',
      reducedMotionHint: 'Reduce nonessential animation.',
    },`,
    `      reducedMotion: 'Reduced motion',
      reducedMotionHint: 'Reduce nonessential animation.',
      themeTeal: 'Cyan / Teal (Default)',
      themeBlue: 'Blue',
      themeGreen: 'Green',
    },`
  );

  // Replace settings.users
  content = content.replace(
    `      deleteUser: 'Delete user',
    },`,
    `      deleteUser: 'Delete user',
      loadError: 'Failed to load accounts',
      deleteConfirm: 'Delete this account?',
    },`
  );

  // Replace settings end
  content = content.replace(
    `      totalMachines: 'Total equipment',
      activeAlarms: 'Active alarms',
    },
  },`,
    `      totalMachines: 'Total equipment',
      activeAlarms: 'Active alarms',
    },
    title: 'System Settings',
    viewerSubtitle: 'Display configurations and personal preferences.',
  },`
  );

  // Add ip in machines.table
  content = content.replace(
    `      actions: 'Actions',
      codeLabel: 'Code',
    },`,
    `      actions: 'Actions',
      codeLabel: 'Code',
      ip: 'IP address',
    },`
  );

  // Replace machines end
  content = content.replace(
    `      topAlarmsTitle: 'TOP 5 ALARMS',
      shiftHourlyProduction: 'Hourly Production (Current Shift)',
    },
  },`,
    `      topAlarmsTitle: 'TOP 5 ALARMS',
      shiftHourlyProduction: 'Hourly Production (Current Shift)',
      loading: 'LOADING EQUIPMENT DETAILS...',
      notFound: 'Equipment not found',
      notFoundDesc: 'The requested equipment was not found in the system database.',
      backList: 'Back to list',
    },
    addModal: {
      title: 'Create new equipment',
    },
    editModal: {
      title: 'Update equipment',
    },
    pressure: 'Pneumatic pressure',
    temperature: 'Station temperature',
    productionCount: 'Good output',
    accumulatedData: 'Accumulated production data',
  },`
  );

  // Replace alarms end
  content = content.replace(
    `      notes: 'Resolution Notes',
      notesPlaceholder: 'Enter resolution action details...',
    },
  },`,
    `      notes: 'Resolution Notes',
      notesPlaceholder: 'Enter resolution action details...',
    },
    action: {
      ack: 'Acknowledge',
      resolve: 'Resolve',
    },
  },`
  );

  // Replace slideshow end
  content = content.replace(
    `    radar: {
      oee: 'OEE',
      yield: 'Yield',
      uptime: 'Uptime',
      uph: 'UPH Achievement',
      productivity: 'Productivity',
      multiskill: 'Multi-skill Rate',
    },
  },`,
    `    radar: {
      oee: 'OEE',
      yield: 'Yield',
      uptime: 'Uptime',
      uph: 'UPH Achievement',
      productivity: 'Productivity',
      multiskill: 'Multi-skill Rate',
    },
    exitFullscreen: 'Exit fullscreen',
    enterFullscreen: 'Enter fullscreen',
    exitSlideshow: 'Exit slideshow mode',
    outputPcs: 'Output (PCS)',
    completionRate: 'Completion Rate (%)',
    table: {
      no: 'No.',
      line: 'Production Line',
      output: 'Output',
      efficiency: 'Efficiency',
      status: 'Status',
      station: 'Station',
      efficiencyTitle: 'PRODUCTION EFFICIENCY',
      machinesList: 'MACHINES LIST',
    },
  },`
  );

  // Replace reports end
  content = content.replace(
    `    defectAssembly: 'Assembly',
    defectOther: 'Other',
  },`,
    `    defectAssembly: 'Assembly',
    defectOther: 'Other',
    tableEmpty: 'No report data for the selected equipment.',
  },`
  );

  // Replace dashboardPage end
  content = content.replace(
    `    qcInspector: 'QC Inspector',
    nextShiftInfo: 'Night Shift 20:00 takes over',
  },`,
    `    qcInspector: 'QC Inspector',
    nextShiftInfo: 'Night Shift 20:00 takes over',
    kpiActiveDevices: 'ACTIVE DEVICES',
    kpiScrapRate: 'SCRAP RATE',
    flowchartState: 'LINE OPERATION STATUS',
    machineUphTitle: 'MACHINE UPH SPEED',
    deviceLabel: 'Equipment',
    torqueActual: 'Actual torque',
    pressActual: 'Actual press force',
    pressTarget: 'Target press force',
    pressSpeed: 'Press speed',
    strokeActual: 'Action stroke',
    cycleTime: 'Cycle Time',
    stationLabel: 'Production station',
    statusRunning: 'Running',
    statusError: 'Error',
    statusStandby: 'Standby',
    statusOffline: 'Offline',
    faultCode: 'Fault Code',
    actualTorque: 'Actual Torque',
    targetTorque: 'Target Torque Limit',
    triggerTime: 'Trigger Time',
    downtimeDuration: 'Downtime Duration',
    yieldImpact: 'Output Impact',
    maintenanceStatus: 'Maintenance Status',
    availability: 'Availability',
    performance: 'Performance',
    quality: 'Quality',
    oee: 'Overall OEE',
  },`
  );

  fs.writeFileSync(enPath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('en updated successfully.');
}

function updateZh() {
  let content = fs.readFileSync(zhPath, 'utf8').replace(/\r\n/g, '\n');

  // Fix nesting bug first
  content = content.replace(
    `    notifications: {
      title: '通知',
      empty: '暂无通知',
      markAllRead: '全部标为已读',
    },
  },
    all: '全部',
    error: '错误',
    success: '成功',
    filter: '筛选',
    uph: 'UPH速度',
    viewerMode: '看板模式',
    guest: '访客',
    minuteName: '分钟',
    confirm: {
      delete: '您确定要删除吗？',
    },
    table: {
      noData: '表格暂无数据',
    },
    errors: {
      errorCode: '检测到错误代码',
      unknown: '发生未知错误。',
    },
  },,`,
    `    notifications: {
      title: '通知',
      empty: '暂无通知',
      markAllRead: '全部标为已读',
    },
    all: '全部',
    error: '错误',
    success: '成功',
    filter: '筛选',
    uph: 'UPH速度',
    viewerMode: '看板模式',
    guest: '访客',
    minuteName: '分钟',
    confirm: {
      delete: '您确定要删除吗？',
    },
    table: {
      noData: '表格暂无数据',
    },
    errors: {
      errorCode: '检测到错误代码',
      unknown: '发生未知错误。',
    },
  },`
  );

  // Replace common.actions
  content = content.replace(
    `      zoomOut: '缩小',
    },`,
    `      zoomOut: '缩小',
      approve: '批准',
      revoke: '撤销',
      back: '返回',
      pending: '处理中...',
    },`
  );

  // Replace common.status
  content = content.replace(
    `      backendOnlineHint: '后端正在响应',
      backendOfflineHint: '无法连接后端',
    },`,
    `      backendOnlineHint: '后端正在响应',
      backendOfflineHint: '无法连接后端',
      noData: '暂无数据',
    },`
  );

  // Replace dashboard end
  content = content.replace(
    `    deviceLineNames: '生产线: {{lines}}',
  },`,
    `    deviceLineNames: '生产线: {{lines}}',
    alarmsLogs: '警报日志',
  },`
  );

  // Replace dashboard end to insert root-level kpi
  content = content.replace(
    `    alarmsLogs: '警报日志',
  },
  lines: {`,
    `    alarmsLogs: '警报日志',
  },
  kpi: {
    activeAlarms: '警报总数',
  },
  lines: {`
  );

  // Replace settings.appearance
  content = content.replace(
    `      reducedMotion: '减弱动态效果',
      reducedMotionHint: '减少不必要的动画。',
    },`,
    `      reducedMotion: '减弱动态效果',
      reducedMotionHint: '减少不必要的动画。',
      themeTeal: '青色 / 蓝绿色 (默认)',
      themeBlue: '蓝色',
      themeGreen: '绿色',
    },`
  );

  // Replace settings.users
  content = content.replace(
    `      deleteUser: '删除用户',
    },`,
    `      deleteUser: '删除用户',
      loadError: '无法加载账户',
      deleteConfirm: '删除此账户？',
    },`
  );

  // Replace settings end
  content = content.replace(
    `      totalMachines: '设备总数',
      activeAlarms: '活动报警',
    },
  },`,
    `      totalMachines: '设备总数',
      activeAlarms: '活动报警',
    },
    title: '系统设置',
    viewerSubtitle: '显示配置和个人偏好。',
  },`
  );

  // Add ip in machines.table
  content = content.replace(
    `      actions: '操作',
      codeLabel: '代码',
    },`,
    `      actions: '操作',
      codeLabel: '代码',
      ip: 'IP地址',
    },`
  );

  // Replace machines end
  content = content.replace(
    `      topAlarmsTitle: '前五大故障',
      shiftHourlyProduction: '当前班次每小时产量',
    },
  },`,
    `      topAlarmsTitle: '前五大故障',
      shiftHourlyProduction: '当前班次每小时产量',
      loading: '正在加载设备信息...',
      notFound: '设备不存在',
      notFoundDesc: '系统数据库中未找到所请求的设备。',
      backList: '返回列表',
    },
    addModal: {
      title: '创建新设备',
    },
    editModal: {
      title: '更新设备',
    },
    pressure: '气压',
    temperature: '工作站温度',
    productionCount: '合格品产量',
    accumulatedData: '累计生产数据',
  },`
  );

  // Replace alarms end
  content = content.replace(
    `      notes: '技术备注',
      notesPlaceholder: '输入处理方案或说明...',
    },
  },`,
    `      notes: '技术备注',
      notesPlaceholder: '输入处理方案或说明...',
    },
    action: {
      ack: '确认',
      resolve: '解决',
    },
  },`
  );

  // Replace slideshow end
  content = content.replace(
    `    radar: {
      oee: 'OEE',
      yield: '合格率',
      uptime: '稼动率',
      uph: 'UPH达成',
      productivity: '生产力',
      multiskill: '多能工率',
    },
  },`,
    `    radar: {
      oee: 'OEE',
      yield: '合格率',
      uptime: '稼动率',
      uph: 'UPH达成',
      productivity: '生产力',
      multiskill: '多能工率',
    },
    exitFullscreen: '退出全屏',
    enterFullscreen: '进入全屏',
    exitSlideshow: '退出投屏模式',
    outputPcs: '产量 (PCS)',
    completionRate: '达成率 (%)',
    table: {
      no: '序号',
      line: '生产线',
      output: '产量',
      efficiency: '效率',
      status: '状态',
      station: '工作站',
      efficiencyTitle: '生产效率',
      machinesList: '设备列表',
    },
  },`
  );

  // Replace reports end
  content = content.replace(
    `    defectAssembly: '装配缺陷',
    defectOther: '其他',
  },`,
    `    defectAssembly: '装配缺陷',
    defectOther: '其他',
    tableEmpty: '所选设备无报告 data。',
  },`
  );

  // Handle case where tableEmpty was already written or replace from original
  content = content.replace("所选设备无报告 data。", "所选设备无报告数据。");
  content = content.replace("tableEmpty: '所选设备无报告数据。',\n  },", "defectAssembly: '装配缺陷',\n    defectOther: '其他',\n    tableEmpty: '所选设备无报告数据。',\n  },");

  // Replace dashboardPage end
  content = content.replace(
    `    qcInspector: '质检员',
    nextShiftInfo: '夜班 20:00 接班',
  },`,
    `    qcInspector: '质检员',
    nextShiftInfo: '夜班 20:00 接班',
    kpiActiveDevices: '运行设备',
    kpiScrapRate: '报废率',
    flowchartState: '产线运行状态',
    machineUphTitle: '单台设备UPH速度',
    deviceLabel: '设备',
    torqueActual: '实际扭矩',
    pressActual: '当前压力',
    pressTarget: '设定压力',
    pressSpeed: '加压速度',
    strokeActual: '运行行程',
    cycleTime: '生产节拍 (Cycle Time)',
    stationLabel: '生产工站',
    statusRunning: '运行中',
    statusError: '故障',
    statusStandby: '待机',
    statusOffline: '离线',
    faultCode: '故障代码',
    actualTorque: '实测扭矩',
    targetTorque: '设定上限',
    triggerTime: '触发时刻',
    downtimeDuration: '停机时长',
    yieldImpact: '影响产量',
    maintenanceStatus: '维保状态',
    availability: '稼动率 (Availability)',
    performance: '生产效率 (Performance)',
    quality: '合格率 (Quality)',
    oee: '综合OEE',
  },`
  );

  fs.writeFileSync(zhPath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('zh updated successfully.');
}

updateEn();
updateZh();
console.log('All targeted locale files updated.');
