import { shell } from "electron";
import type {
  DescriptionQuery,
  DescriptionResult,
} from "../../../../shared/types";
import { LOCAL_DESCRIPTION_KNOWLEDGE_BASE } from "./knowledge-base.zh-CN";

export class DescriptionService {
  async describe(query: DescriptionQuery): Promise<DescriptionResult> {
    const key = query.name.toLowerCase();
    const localHit = Object.entries(LOCAL_DESCRIPTION_KNOWLEDGE_BASE).find(
      ([pattern]) => key.includes(pattern),
    );

    if (localHit) {
      return localHit[1];
    }

    const searchUrl = this.createSearchUrl(query);
    return {
      title: `${query.name} 的在线说明`,
      summary:
        "本地知识库暂无明确说明,可点击一键查询打开浏览器搜索该文件或进程的用途。",
      source: "onlineSearch",
      searchUrl,
      confidence: "low",
    };
  }

  async openOnlineSearch(query: DescriptionQuery): Promise<void> {
    await shell.openExternal(this.createSearchUrl(query));
  }

  private createSearchUrl(query: DescriptionQuery): string {
    const target = query.path ? `${query.name} ${query.path}` : query.name;
    const keyword = encodeURIComponent(
      `${target} ${this.buildKindQuestion(query.kind)}`,
    );
    return `https://www.baidu.com/s?wd=${keyword}`;
  }

  /** 按目标类型生成中文追问关键词，帮助用户判断是否可以删除。 */
  private buildKindQuestion(kind: DescriptionQuery["kind"]): string {
    if (kind === "process") {
      return "是什么程序 是否可以删除 是否安全 进程用途, 先说是否可以删除，再展开描述";
    }

    if (kind === "service") {
      return "是什么服务 是否可以禁用 是否安全, 先说是否可以删除，再展开描述";
    }

    if (kind === "registry") {
      return "是什么注册表项 是否可以清理 是否安全, 先说是否可以删除，再展开描述";
    }

    return "是什么文件 是否可以删除 是否安全, 先说是否可以删除，再展开描述";
  }
}
