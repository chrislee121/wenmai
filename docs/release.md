# 发版

权威版本号在 `package.json` 的 `version`，必须与 Git tag `vX.Y.Z` 一致。

PATCH=修复，MINOR=功能，MAJOR=破坏性变更。

## 清单

1. 从 `develop` 拉 `release/vX.Y.Z`
2. 改 `package.json` 的 `version`
3. 更新 `CHANGELOG.md` 与 README 里的当前版本号
4. 跑 `npm run release-check`（单元测试 + 端到端功能测试，含 review / written 三态）
5. 提交，例如 `chore: 发布 vX.Y.Z`
6. 推送 `release/vX.Y.Z`，向 **`main` 开 PR**（禁止本地直 merge `main` 后 push）
7. PR 合进 `main` 后拉取 `main`，打 tag `vX.Y.Z` 并推送
8. 确认 GitHub Actions `.github/workflows/publish.yml` 已把 npm 包发出去
9. 本地把 `main` merge 回 `develop` 并 push（合回 `develop` 无需 PR）

```sh
npm run release-check
git tag vX.Y.Z
git push origin vX.Y.Z
```

卸载插件不会删除文脉数据。发版不改用户的 `raw/`。
