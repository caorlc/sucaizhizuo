import { createTask, pollTaskResult, type KieImageSize } from "../kie";
import type { GenProvider, GenInput } from "./types";

export const kieProvider: GenProvider = {
  async generate(input: GenInput): Promise<{ imageUrl: string }> {
    const imageUrl = input.imageUrls?.[0];
    if (!imageUrl) throw new Error("KIE edit 模型需要至少一张输入图（imageUrls）");
    const taskId = await createTask({
      model: input.model,
      prompt: input.prompt,
      imageUrl,
      imageSize: input.size as KieImageSize,
    });
    const resultUrl = await pollTaskResult(taskId);
    return { imageUrl: resultUrl };
  },
};
