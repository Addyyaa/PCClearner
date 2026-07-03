import { useEffect, useMemo, useState } from "react";
import type {
  CleanableItem,
  DiskScanResult,
  DiskVolumeUsage,
} from "../../../../shared/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FeatureCard } from "../components/FeatureCard";
import { SelectionActions } from "../components/SelectionActions";
import { StatusBadge } from "../components/StatusBadge";
import { Touchable } from "../components/Touchable";
import { useAppApi } from "../hooks/useAppApi";
import { useAppStore } from "../store/appStore";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function DiskCleanerPage() {
  const { api, withLoading } = useAppApi();
  const showToast = useAppStore((state) => state.showToast);
  const [volumes, setVolumes] = useState<DiskVolumeUsage[]>([]);
  const [selectedVolume, setSelectedVolume] = useState("");
  const [result, setResult] = useState<DiskScanResult>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    void api.disk.listVolumes().then((nextVolumes: DiskVolumeUsage[]) => {
      setVolumes(nextVolumes);
      const systemVolume =
        nextVolumes.find((volume) => volume.isSystemVolume) ?? nextVolumes[0];
      if (systemVolume) {
        setSelectedVolume(systemVolume.mountPoint);
      }
    });
  }, [api]);

  const selectedBytes = useMemo(() => {
    if (!result) return 0;
    return result.items
      .filter((item) => selectedIds.includes(item.id))
      .reduce((sum, item) => sum + item.sizeBytes, 0);
  }, [result, selectedIds]);

  const sortedItems = useMemo(
    () =>
      result
        ? [...result.items].sort(
            (left, right) => right.sizeBytes - left.sizeBytes,
          )
        : [],
    [result],
  );

  async function scan() {
    if (!selectedVolume) {
      showToast("请先选择要扫描的磁盘。");
      return;
    }

    const nextResult = await withLoading("正在扫描系统盘与安全清理项...", () =>
      api.disk.scan({
        targetPath: selectedVolume,
        includeSystemDisk: true,
        includeBrowserCaches: true,
        maxDepth: 2,
      }),
    );

    if (nextResult) {
      setResult(nextResult);
      setSelectedIds(
        nextResult.items
          .filter((item: CleanableItem) => item.selectedByDefault)
          .map((item: CleanableItem) => item.id),
      );
    }
  }

  function toggleItem(item: CleanableItem) {
    setSelectedIds((current) =>
      current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : [...current, item.id],
    );
  }

  async function openOnlineDescription(item: CleanableItem) {
    await withLoading("正在打开在线查询...", () =>
      api.description.openOnlineSearch({
        name: item.name,
        path: item.path,
        kind: "file",
      }),
    );
  }

  async function clean() {
    setConfirmOpen(false);
    const operation = await withLoading("正在移动到回收站...", () =>
      api.disk.clean({
        itemIds: selectedIds,
        moveToTrash: true,
        createBackup: true,
      }),
    );

    if (operation?.success) {
      showToast(operation.message);
      await scan();
    } else if (operation) {
      showToast(operation.message);
    }
  }

  return (
    <FeatureCard
      title="磁盘清理"
      description="默认勾选“建议删除”和“强烈建议删除”项,每个项目都提供中文说明和一键查询入口。"
    >
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <label className="flex min-w-[220px] flex-col gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          选择磁盘
          <select
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={selectedVolume}
            onChange={(event) => {
              setSelectedVolume(event.target.value);
              setResult(undefined);
              setSelectedIds([]);
            }}
          >
            {volumes.length === 0 ? (
              <option value="">正在加载磁盘列表...</option>
            ) : null}
            {volumes.map((volume) => (
              <option key={volume.id} value={volume.mountPoint}>
                {volume.name} ({formatBytes(volume.freeBytes)} 可用)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Touchable onClick={scan} disabled={!selectedVolume}>
          开始扫描
        </Touchable>
        <SelectionActions
          itemCount={result?.items.length ?? 0}
          onSelectAll={() => setSelectedIds(result?.items.map((item) => item.id) ?? [])}
          onClearAll={() => setSelectedIds([])}
        />
        <Touchable variant="secondary" disabled={!result}>
          预估释放 {formatBytes(selectedBytes)}
        </Touchable>
        <Touchable
          variant="danger"
          disabled={selectedIds.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          清理选中项 ({selectedIds.length})
        </Touchable>
      </div>

      {result?.summary.inaccessibleLocations?.length ? (
        <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
          以下位置需要提权扫描:{" "}
          {result.summary.inaccessibleLocations.join("、")}
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {sortedItems.slice(0, 80).map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selectedIds.includes(item.id)}
              onChange={() => toggleItem(item)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="truncate">{item.name}</strong>
                {item.appName ? (
                  <StatusBadge tone="neutral">{item.appName}</StatusBadge>
                ) : null}
                {item.isDirectory ? (
                  <StatusBadge tone="warning">目录</StatusBadge>
                ) : null}
                <StatusBadge
                  tone={
                    item.riskLevel === "stronglyRecommended"
                      ? "danger"
                      : "neutral"
                  }
                >
                  {item.recommendedLabel}
                </StatusBadge>
                <span className="text-xs text-slate-500">
                  {formatBytes(item.sizeBytes)}
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {item.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Touchable
                  variant="secondary"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => api.app.showItemInFolder(item.path)}
                >
                  打开所在位置
                </Touchable>
                <Touchable
                  variant="ghost"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => openOnlineDescription(item)}
                >
                  在线查询
                </Touchable>
              </div>
            </div>
          </div>
        ))}
        {!result ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            选择磁盘后点击「开始扫描」。
          </p>
        ) : null}
        {result && result.items.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            该磁盘暂无可清理项,或需要管理员权限扫描系统目录。
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="确认清理"
        description={`将 ${selectedIds.length} 个项目移动到系统回收站,高风险项会先备份。释放约 ${formatBytes(selectedBytes)}。`}
        onConfirm={clean}
        onCancel={() => setConfirmOpen(false)}
      />
    </FeatureCard>
  );
}
