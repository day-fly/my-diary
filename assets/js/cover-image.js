(function () {
  "use strict";
  const MAX_EDGE = 1600;
  const cache = new WeakMap();
  function dimensions(width, height) {
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    )
      throw new Error("사진 크기를 확인하지 못했습니다.");
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }
  async function convert(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(
            new Error(
              "표지 사진을 읽을 수 없습니다. 다른 사진을 선택해 주세요.",
            ),
          );
        img.src = url;
      });
      const size = dimensions(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("이 브라우저에서 표지 사진을 처리할 수 없습니다.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size.width, size.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, size.width, size.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.86),
      );
      if (!blob)
        throw new Error(
          "표지 사진을 저장할 수 없습니다. 다른 사진을 선택해 주세요.",
        );
      return {
        file: new File(
          [blob],
          file.name.replace(/\.[^.]+$/, "") + "-cover.jpg",
          { type: "image/jpeg" },
        ),
        ...size,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function prepare(file) {
    if (!cache.has(file)) {
      const pending = convert(file).catch((error) => {
        cache.delete(file);
        throw error;
      });
      cache.set(file, pending);
    }
    return cache.get(file);
  }
  window.DiaryCoverImage = { prepare, dimensions };
})();
