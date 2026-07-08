import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const viPath = path.join(root, 'src/app/i18n/vi/index.ts');
const enPath = path.join(root, 'src/app/i18n/en/index.ts');
const zhPath = path.join(root, 'src/app/i18n/zh-CN/index.ts');

const additions = {
  vi: {
    // 1. flowDesigner
    flowDesigner: `  flowDesigner: {
    confirmRemove: 'Xóa máy trạm này khỏi dây chuyền?',
    empty: {
      title: 'Dây chuyền trống',
    },
    toast: {
      orderUpdated: 'Đã cập nhật thứ tự trạm máy',
      orderUpdateFailed: 'Lỗi cập nhật thứ tự',
      machineAdded: 'Đã thêm thiết bị vào dây chuyền',
      addMachineFailed: 'Lỗi thêm thiết bị',
      machineRemoved: 'Đã xóa thiết bị khỏi dây chuyền',
      removeMachineFailed: 'Lỗi xóa thiết bị',
    },
  },`,
    // 2. linesPage
    linesPageEmptyTable: "    emptyTable: 'Chưa có dây chuyền sản xuất nào được cấu hình.',",
    // 3. pages.users
    pagesUsers: `    users: {
      toasts: {
        createError: 'Lỗi khi tạo tài khoản',
      },
      validation: {
        usernamePasswordRequired: 'Tên tài khoản và mật khẩu là bắt buộc',
      },
      loading: 'Đang tải danh sách tài khoản...',
      loadErrorTitle: 'Lỗi tải dữ liệu',
      loadError: 'Không thể lấy danh sách người dùng. Kiểm tra quyền Admin.',
      deleteConfirmTitle: 'Xác nhận xóa tài khoản',
      deleteWarning: 'Hành động này không thể hoàn tác. Bạn có chắc chắn muốn xóa tài khoản ',
      table: {
        username: 'Tên tài khoản',
        role: 'Quyền hạn',
        actions: 'Thao tác',
        activeSelf: 'Tài khoản của bạn',
      },
    },`,
    // 4. settings.stats
    settingsStatsActiveUser: "      activeUser: 'Người dùng',",
    // 5. settings.profile
    settingsProfile: `    profile: {
      title: 'Thông tin tài khoản',
      username: 'Tên đăng nhập',
      role: 'Quyền hạn',
    },`,
    // 6. settings.language
    settingsLanguageSelectLabel: "      selectLabel: 'Chọn ngôn ngữ hệ thống',",
    // 7. settings.theme
    settingsTheme: `    theme: {
      title: 'Tùy chỉnh giao diện',
      selectLabel: 'Tông màu chủ đạo',
    },`,
    // 8. settings.users
    settingsUsersTitle: "      title: 'Quản lý tài khoản (Admin Only)',",
  },
  en: {
    flowDesigner: `  flowDesigner: {
    confirmRemove: 'Remove this equipment from the production line?',
    empty: {
      title: 'Empty Production Line',
    },
    toast: {
      orderUpdated: 'Machine order updated',
      orderUpdateFailed: 'Failed to update machine order',
      machineAdded: 'Equipment added to line',
      addMachineFailed: 'Failed to add equipment',
      machineRemoved: 'Equipment removed from line',
      removeMachineFailed: 'Failed to remove equipment',
    },
  },`,
    linesPageEmptyTable: "    emptyTable: 'No production lines have been configured yet.',",
    pagesUsers: `    users: {
      toasts: {
        createError: 'Failed to create account',
      },
      validation: {
        usernamePasswordRequired: 'Username and password are required',
      },
      loading: 'Loading account list...',
      loadErrorTitle: 'Data Load Error',
      loadError: 'Failed to retrieve user list. Please check your Administrator permissions.',
      deleteConfirmTitle: 'Confirm Account Deletion',
      deleteWarning: 'This action cannot be undone. Are you sure you want to delete account ',
      table: {
        username: 'Username',
        role: 'Role',
        actions: 'Actions',
        activeSelf: 'Your account',
      },
    },`,
    settingsStatsActiveUser: "      activeUser: 'User',",
    settingsProfile: `    profile: {
      title: 'Account Profile',
      username: 'Username',
      role: 'Role',
    },`,
    settingsLanguageSelectLabel: "      selectLabel: 'Select system language',",
    settingsTheme: `    theme: {
      title: 'Theme Settings',
      selectLabel: 'Accent Color',
    },`,
    settingsUsersTitle: "      title: 'Account Management (Admin Only)',",
  },
  zh: {
    flowDesigner: `  flowDesigner: {
    confirmRemove: '是否将此工作站从生产线中删除？',
    empty: {
      title: '空生产线',
    },
    toast: {
      orderUpdated: '已更新工作站顺序',
      orderUpdateFailed: '更新顺序失败',
      machineAdded: '已成功将设备添加到生产线',
      addMachineFailed: '添加设备失败',
      machineRemoved: '已成功将设备从生产线移除',
      removeMachineFailed: '移除设备失败',
    },
  },`,
    linesPageEmptyTable: "    emptyTable: '尚未配置任何生产线。',",
    pagesUsers: `    users: {
      toasts: {
        createError: '创建账户失败',
      },
      validation: {
        usernamePasswordRequired: '用户名和密码是必填项',
      },
      loading: '正在加载账户列表...',
      loadErrorTitle: '数据加载失败',
      loadError: '无法获取用户列表。请检查您的管理员权限。',
      deleteConfirmTitle: '确认删除账户',
      deleteWarning: '此操作无法撤销。您确定要删除账户吗 ',
      table: {
        username: '用户名',
        role: '权限',
        actions: '操作',
        activeSelf: '您的账户',
      },
    },`,
    settingsStatsActiveUser: "      activeUser: '用户',",
    settingsProfile: `    profile: {
      title: '账户信息',
      username: '用户名',
      role: '权限',
    },`,
    settingsLanguageSelectLabel: "      selectLabel: '选择系统语言',",
    settingsTheme: `    theme: {
      title: '主题设置',
      selectLabel: '主题色调',
    },`,
    settingsUsersTitle: "      title: '账户管理 (仅限管理员)',",
  },
};

function processFile(filePath, langKey) {
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const a = additions[langKey];

  // 1. linesPage.emptyTable (after empty block in linesPage)
  if (!content.includes('emptyTable:')) {
    content = content.replace(
      /(empty:\s*\{[\s\S]*?description:\s*['"][^'"]*['"]\s*,?\s*\n\s*\},)/g,
      `$1\n${a.linesPageEmptyTable}`
    );
  }

  // 2. pages.users (inserted before dashboardPage block inside pages)
  if (!content.includes('users: {') && content.includes('auditLogs: {')) {
    content = content.replace(
      /(reports:\s*\{[\s\S]*?tableEmpty:\s*['"][^'"]*['"]\s*,?\s*\n\s*\}\s*,\s*\n\s*\})\s*,\s*\n\s*dashboardPage:\s*\{/g,
      `$1,\n${a.pagesUsers}\n  },\n  dashboardPage: {`
    );
  }

  // 3. settings.stats.activeUser
  if (!content.includes('activeUser:')) {
    content = content.replace(
      /(plcOnline:\s*['"][^'"]*['"]\s*,?\s*\n)/g,
      `$1${a.settingsStatsActiveUser}\n`
    );
  }

  // 4. settings.profile (after stats block)
  if (!content.includes('profile:')) {
    content = content.replace(
      /(stats:\s*\{[\s\S]*?plcOnline:\s*['"][^'"]*['"][\s\S]*?\}\s*,\s*\n)/g,
      `$1${a.settingsProfile}\n`
    );
  }

  // 5. settings.language.selectLabel
  if (!content.includes('selectLabel:') && content.includes('language: {')) {
    content = content.replace(
      /(language:\s*\{[\s\S]*?hint:\s*['"][^'"]*['"]\s*,?\s*\n)/g,
      `$1${a.settingsLanguageSelectLabel}\n`
    );
  }

  // 6. settings.theme (after language block)
  if (!content.includes('theme: {') && content.includes('language: {')) {
    content = content.replace(
      /(language:\s*\{[\s\S]*?hint:\s*['"][^'"]*['"][\s\S]*?\}\s*,\s*\n)/g,
      `$1${a.settingsTheme}\n`
    );
  }

  // 7. settings.users.title
  if (!content.includes("title: 'Quản lý tài khoản") && !content.includes("title: 'Account Management") && !content.includes("title: '账户管理")) {
    content = content.replace(
      /(deleteConfirm:\s*['"][^'"]*['"]\s*,?\s*\n)/g,
      `$1${a.settingsUsersTitle}\n`
    );
  }

  // 8. flowDesigner (at the very end of file right before '} as const;')
  if (!content.includes('flowDesigner:')) {
    content = content.replace(
      /(\n\s*\}\s*as\s*const\s*;)/g,
      `,\n${a.flowDesigner}$1`
    );
  }

  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log(`${langKey} source keys updated successfully.`);
}

processFile(viPath, 'vi');
processFile(enPath, 'en');
processFile(zhPath, 'zh');
console.log('All source keys updates finished.');
