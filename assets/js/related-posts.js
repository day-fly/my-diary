(function () {
  "use strict";
  // Rank the published text itself, so writing never requires tags or categories.
  function terms(post) {
    const counts = new Map();
    const ignored = /^(그것|이것|저것|그리고|하지만|그래서|그러나|때문|것입|있었|없었|했습|합니|입니|습니|같습|하는|나는|저는|우리|그저|조금|정말|어떤|모든|있는|없는|않는|하며|이런|그런|오늘|시간|마음)/;
    function add(text, weight) {
      (text.toLowerCase().match(/[가-힣a-z]{2,}/g) || []).forEach((word) => {
        if (ignored.test(word)) return;
        const term = word.replace(/(으로|에서|에게|처럼|보다|까지|부터|이라|은|는|이|가|을|를|의|에|도|와|과|만)$/, "").slice(0, 3);
        if (term.length < 2) return;
        counts.set(term, Math.min(4, (counts.get(term) || 0) + weight));
      });
    }
    add(post.text || "", 1);
    add(post.title || "", 3);
    return counts;
  }
  function selectRelated(posts, currentUrl, limit = 2) {
    const unique = Array.from(new Map(posts.filter(p => p && typeof p.url === "string").map(p => [p.url, p])).values());
    const current = unique.findIndex(p => p.url === currentUrl);
    if (current < 0) return [];
    const bags = unique.map(terms);
    // Shared vocabulary catches related ideas even when the exact nouns differ.
    // These are derived at read time, never fields the author has to maintain.
    const vocabulary = [
      /식탁|음식|요리|반찬|국물|무국|멸치|장떡|파래|닭다리|통닭|라면|핫도그|밥상/g,
      /어머니|아버지|엄마|아빠|할머니|할아버지|부모|고향/g,
      /아이|자녀|아들|장난감|학원|육아|줄넘기/g,
      /학교|교실|교무실|선생님|학창|기숙사|하교|국민학교/g,
      /서점|독서|소설|문학|도서|작가|글쓰기|글을 쓰/g,
      /바다|바람|꽃|솔잎|이슬비|계절|낙엽|나뭇잎|자연/g,
      /군대|군복|군화|훈련|이등병|내무반|철조망/g,
      /여행|공항|비행기|낯선 도시|휴가/g,
    ];
    const contexts = unique.map(post => vocabulary.map(pattern => {
      const body = ((post.title || "") + " " + (post.text || "")).match(pattern) || [];
      const title = (post.title || "").match(pattern) || [];
      return Math.min(1, body.length / 4 + title.length * 0.5);
    }));
    const frequency = new Map();
    bags.forEach(bag => bag.forEach((_, term) => frequency.set(term, (frequency.get(term) || 0) + 1)));
    const vectors = bags.map(bag => {
      let sum = 0;
      const vector = new Map();
      bag.forEach((count, term) => {
        const value = (1 + Math.log(count)) * Math.log(1 + unique.length / (1 + frequency.get(term)));
        vector.set(term, value);
        sum += value * value;
      });
      const length = Math.sqrt(sum) || 1;
      vector.forEach((value, term) => vector.set(term, value / length));
      return vector;
    });
    return unique.map((post, index) => {
      let score = 0;
      vectors[current].forEach((value, term) => score += value * (vectors[index].get(term) || 0));
      contexts[current].forEach((value, topic) => score += 0.2 * value * contexts[index][topic]);
      return { post, index, score };
    }).filter(item => item.index !== current)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, limit).map(item => item.post);
  }
  if (typeof module === "object" && module.exports) module.exports = { selectRelated };
  if (typeof document === "undefined") return;
  const section = document.querySelector(".related-posts");
  if (!section) return;
  async function load() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(section.dataset.readingIndex, { signal: controller.signal });
      if (!response.ok) return;
      const posts = await response.json();
      if (!Array.isArray(posts)) return;
      const list = section.querySelector(".related-list");
      selectRelated(posts, section.dataset.currentPost).forEach(post => {
        const url = new URL(post.url, location.href);
        if (url.origin !== location.origin) return;
        const link = document.createElement("a");
        link.className = "related-card";
        link.href = url.href;
        if (post.image) {
          const source = new URL(post.image, location.href);
          if (["https:", "http:"].includes(source.protocol)) {
            const image = document.createElement("img");
            image.src = source.href;
            image.alt = "";
            image.loading = "lazy";
            image.width = 96;
            image.height = 72;
            link.append(image);
          }
        }
        const text = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = post.title;
        const date = document.createElement("span");
        date.className = "related-date";
        date.textContent = post.date;
        text.append(title, date);
        link.append(text);
        list.append(link);
      });
      section.hidden = !list.children.length;
    } catch (_) {
      // The server-rendered previous/next links remain available offline.
    } finally { clearTimeout(timer); }
  }
  const anchor = document.querySelector(".post-pager");
  if ("IntersectionObserver" in window && anchor) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: "600px" });
    observer.observe(anchor);
  } else load();
})();
