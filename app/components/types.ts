// 前端与后端共享的消息类型
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
