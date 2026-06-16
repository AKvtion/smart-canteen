# 智慧食堂 MVP

一个可直接内网试跑的最小版本，覆盖 6 个模块：

1. 员工管理
2. 菜单/餐次管理
3. 订餐管理
4. 充值/余额管理
5. 人脸识别/饭卡核销
6. 统计报表

## 技术栈

当前 MVP 为了快速落地，使用：

- Node.js + Express
- JSON 文件存储：`data/db.json`
- 原生 HTML 页面

后续可迁移为：Spring Boot + MySQL + Vue3 + Element Plus。

## 启动

```bash
cd smart-canteen
npm install
npm run seed
npm start
```

访问：

```text
http://localhost:3000
```

内网部署时，把 `localhost` 换成服务器 IP，例如：

```text
http://10.33.111.100:3000
```

## 默认账号和测试数据

运行 `npm run seed` 后会生成管理员账号：

```text
admin / admin123
```

测试数据：

- 张三：饭卡号 `10001`，人脸码 `face001`，余额 100
- 李四：饭卡号 `10002`，人脸码 `face002`，余额 50
- 今日早餐/午餐/晚餐菜单

## 刷卡核销

真实 USB IC/ID 读卡器通常是键盘模拟模式：

1. 打开核销页面
2. 光标点到“刷卡输入卡号”输入框
3. 员工刷卡
4. 读卡器自动输入卡号并回车
5. 系统调用 `/api/canteen/verify` 完成核销扣款

## 核心接口

### 员工

- `GET /api/employees`
- `POST /api/employees`
- `PUT /api/employees/:id`

### 菜单

- `GET /api/menus?date=YYYY-MM-DD`
- `POST /api/menus`

### 订餐

- `POST /api/orders`
- `GET /api/orders?date=YYYY-MM-DD`

### 充值

- `POST /api/recharge`
- `GET /api/balance-logs`

### 核销

- `POST /api/canteen/verify`

刷卡请求：

```json
{
  "method": "card",
  "cardNo": "10001",
  "mealType": "lunch",
  "deviceId": "canteen-01"
}
```

人脸请求：

```json
{
  "method": "face",
  "faceCode": "face001",
  "mealType": "lunch",
  "deviceId": "canteen-01"
}
```

### 报表

- `GET /api/reports/daily?date=YYYY-MM-DD`

## 已完成功能

- 管理员登录/退出
- API Token 鉴权
- 员工管理
- 菜单/餐次管理
- 订餐管理
- 管理员充值
- 刷卡/人脸码核销扣款
- 订单取消
- 日报统计
- 余额流水/核销日志

## 下一步开发建议

1. 改成 MySQL 存储
2. 增加角色权限：管理员、员工、核销终端
3. 增加 Excel 导出
4. 增加退款和补贴规则
5. 接入真实 USB 读卡器测试
6. 接入 Python + InsightFace 人脸识别终端
