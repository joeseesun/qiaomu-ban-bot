# 社区标注服务

Python 3.12+ 标准库和本地 SQLite（WAL）。以独立非 root 用户运行，监听 `127.0.0.1:3258`，由 Nginx 提供 HTTPS。无公开注册、无管理员网页、无第三方统计脚本。

## 身份与数据

管理员为每个参与者生成一个一次性邀请码，默认七天过期。邀请码兑换独立访问令牌；数据库只存 SHA-256 摘要。订阅身份不能提交标注。请勿将同一共建身份给多人使用。

```sh
sudo -u qiaomu-x-community python3 /opt/qiaomu-apps/x-community/community.py \
  --db /var/lib/qiaomu-x-community/community.sqlite \
  --invite-file /var/lib/qiaomu-x-community/invite-person.txt
```

私密传递文件内容后删除邀请码文件。加 `--scope read` 创建只读身份。不要把邀请或访问令牌提交到 Git。

- `GET /health`：公开健康检查。
- `POST /v1/enroll`：一次性邀请兑换。
- `POST /v1/annotations`：Bearer 身份；`postId,userId,handle,label,revision`。`label=null` 撤回；旧修订不能覆盖新修订。同人同帖只保留一条。
- `POST /v1/accounts/query`：最多 50 个账号 ID；返回两侧票数、独立帖子和参与者、分歧帖子数。不含贡献者身份；排除查询者自己的标签。
- `POST /v1/withdraw`：撤回本身份全部标注。客户端关闭贡献并清理待同步项。

禁用滥用身份：

```sh
sudo -u qiaomu-x-community python3 /opt/qiaomu-apps/x-community/community.py \
  --db /var/lib/qiaomu-x-community/community.sqlite --revoke CONTRIBUTOR_ID
```

禁用后其全部票数立即不参与聚合。社区是人工报告，邀请制不能完全消除多人串通或误标；当前版本只作为参考证据，不自动按社区票数折叠或执行 X 操作。

## 运维与恢复

安装 `qiaomu-x-community.service`；数据库目录归该用户所有，权限 0700。应用代码不包含生产数据。Nginx 请求体限制 16 KB、限速及连接限制；关闭此服务访问日志，避免记录公开账号的浏览请求轨迹。应用不设置 CORS，扩展在用户授权域名访问后直接请求。

安装随附的 `qiaomu-x-community-backup.service` 与 `.timer`，启用 timer。在线备份使用 Python `sqlite3.Connection.backup`（不要仅复制活跃 WAL 数据库文件）。每天保存至 `/var/lib/qiaomu-x-community/backups`，保留约 8 天；恢复时停止本服务，将备份恢复为数据库并清理该数据库的旧 WAL/SHM，再启动服务。不要操作其他服务的数据库。

验收：`python3 -m unittest discover -s server -p 'test_*.py'`；真实 HTTPS 验收使用临时测试身份，完成后禁用并清理测试记录。监控 `/health`，不把健康检查成功当作标注写入成功。
