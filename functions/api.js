export async function onRequest(context) {
  const url = new URL(context.request.url);
  const mode = url.searchParams.get('m') || 'h';

  // 색상
  const orange = '#D4743C';
  const dimOrange = '#8B5A2B';

  // 배경 이미지 URL
  const homeBg = 'https://raw.githubusercontent.com/luzruz555/frost-assets/refs/heads/main/home-bg.png';
  const postBg = 'https://raw.githubusercontent.com/luzruz555/frost-assets/refs/heads/main/post-bg.png';

  // 이미지 Base64 로드 함수
  async function loadImageBase64(imageUrl) {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  let svg = '';

  if (mode === 'h') {
    // ========== 홈 (목록) - 4개 ==========
    const listRaw = decodeURIComponent(url.searchParams.get('l') || '');
    const posts = [];

    if (listRaw) {
      const items = listRaw.split('/./');
      for (let i = 0; i < Math.min(items.length, 4); i++) {
        const parts = items[i].split('|');
        posts.push({
          type: parts[0] || 'g',
          title: parts[1] || '',
          comments: parts[2] || '0'
        });
      }
    }

    // 게시물 Y 좌표 (4개 박스) - 1920x1080 기준
    const boxY = [310, 440, 570, 700];
    const titleY = boxY.map(y => y + 55);
    const commentY = boxY.map(y => y + 55);

    let postsHtml = '';
    for (let i = 0; i < 4; i++) {
      const p = posts[i] || { type: 'g', title: '', comments: '0' };
      
      let prefix = '';
      let titleColor = orange;
      if (p.type === 'n') {
        prefix = '[공지] ';
        titleColor = '#FF4444';
      } else if (p.type === 'h') {
        prefix = '[인기] ';
        titleColor = '#FFAA00';
      }

      postsHtml += `
        <text x="65" y="${titleY[i]}" fill="${titleColor}" font-size="32" font-family="'Noto Sans KR', sans-serif" font-weight="700">${prefix}${p.title}</text>
        <text x="1000" y="${commentY[i]}" fill="${orange}" font-size="28" font-family="'Noto Sans KR', sans-serif" text-anchor="middle">${p.comments}</text>
      `;
    }

    // 배경 이미지 로드
    const bgBase64 = await loadImageBase64(homeBg);

    svg = `
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&amp;display=swap');
          </style>
        </defs>
        <image href="data:image/png;base64,${bgBase64}" width="1920" height="1080"/>
        ${postsHtml}
      </svg>
    `;

  } else if (mode === 'p') {
    // ========== 포스트 (상세) ==========
    const type = decodeURIComponent(url.searchParams.get('y') || 'g');
    const title = decodeURIComponent(url.searchParams.get('t') || '');
    const author = decodeURIComponent(url.searchParams.get('a') || '');
    const views = decodeURIComponent(url.searchParams.get('v') || '0');
    const likes = decodeURIComponent(url.searchParams.get('k') || '0');
    const content = decodeURIComponent(url.searchParams.get('c') || '');
    const repliesRaw = decodeURIComponent(url.searchParams.get('r') || '');

    let prefix = '';
    let titleColor = orange;
    if (type === 'n') {
      prefix = '[공지] ';
      titleColor = '#FF4444';
    } else if (type === 'h') {
      prefix = '[인기] ';
      titleColor = '#FFAA00';
    }

    // 본문 줄바꿈
    function wrapText(text, maxWidth) {
      const lines = [];
      let currentLine = '';
      let currentWidth = 0;
      for (const char of text) {
        const charWidth = /[가-힣]/.test(char) ? 28 : 14;
        if (currentWidth + charWidth > maxWidth) {
          lines.push(currentLine);
          currentLine = char;
          currentWidth = charWidth;
        } else {
          currentLine += char;
          currentWidth += charWidth;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    }

    // 왼쪽 본문 영역
    const contentLines = wrapText(content, 820);
    let contentHtml = '';
    for (let i = 0; i < contentLines.length; i++) {
      contentHtml += `<text x="65" y="${380 + (i * 38)}" fill="${orange}" font-size="26" font-family="'Noto Sans KR', sans-serif">${contentLines[i]}</text>`;
    }

    // 오른쪽 댓글 영역
    const replies = [];
    if (repliesRaw) {
      const items = repliesRaw.split('/./');
      for (let i = 0; i < Math.min(items.length, 6); i++) {
        const parts = items[i].split('|');
        replies.push({
          nick: parts[0] || '',
          text: parts[1] || '',
          likes: parts[2] || '0'
        });
      }
    }

    const replyStartY = 380;
    let repliesHtml = '';
    for (let i = 0; i < replies.length; i++) {
      const r = replies[i];
      repliesHtml += `
        <text x="940" y="${replyStartY + (i * 70)}" fill="${orange}" font-size="22" font-family="'Noto Sans KR', sans-serif" font-weight="700">${r.nick}</text>
        <text x="940" y="${replyStartY + (i * 70) + 28}" fill="${dimOrange}" font-size="20" font-family="'Noto Sans KR', sans-serif">${r.text}</text>
        <text x="1850" y="${replyStartY + (i * 70) + 14}" fill="${dimOrange}" font-size="18" font-family="'Noto Sans KR', sans-serif">[+${r.likes}]</text>
      `;
    }

    // 배경 이미지 로드
    const bgBase64 = await loadImageBase64(postBg);

    svg = `
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&amp;display=swap');
          </style>
        </defs>
        <image href="data:image/png;base64,${bgBase64}" width="1920" height="1080"/>
        
        <!-- 제목 -->
        <text x="65" y="340" fill="${titleColor}" font-size="34" font-family="'Noto Sans KR', sans-serif" font-weight="700">${prefix}${title}</text>
        
        <!-- 본문 (왼쪽) -->
        ${contentHtml}
        
        <!-- 댓글 (오른쪽) -->
        ${repliesHtml}
      </svg>
    `;
  }

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
