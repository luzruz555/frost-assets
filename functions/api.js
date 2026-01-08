export async function onRequest(context) {
  const url = new URL(context.request.url);
  const mode = url.searchParams.get('m') || 'h';

  // 색상
  const orange = '#D4743C';
  const dimOrange = '#9A6A4A';

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
          author: parts[2] || '',
          comments: parts[3] || '0'
        });
      }
    }

    // 게시물 Y 좌표 (4개 박스) - 1920x1080 기준
    const boxY = [440, 600, 760, 920];
    const titleY = boxY.map(y => y + 45);
    const authorY = boxY.map(y => y + 95);
    const commentY = boxY.map(y => y + 70);

    let postsHtml = '';
    for (let i = 0; i < 4; i++) {
      const p = posts[i] || { type: 'g', title: '', author: '', comments: '0' };
      
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
        <text x="85" y="${titleY[i]}" fill="${titleColor}" font-size="48" font-family="'Noto Sans KR', sans-serif" font-weight="700">${prefix}${p.title}</text>
        <text x="85" y="${authorY[i]}" fill="${dimOrange}" font-size="34" font-family="'Noto Sans KR', sans-serif" font-weight="700">${p.author}</text>
        <text x="1285" y="${commentY[i]}" fill="${orange}" font-size="44" font-family="'Noto Sans KR', sans-serif" font-weight="700" text-anchor="middle">${p.comments}</text>
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
        const charWidth = /[가-힣]/.test(char) ? 32 : 18;
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
    const contentLines = wrapText(content, 530);
    let contentHtml = '';
    for (let i = 0; i < contentLines.length; i++) {
      contentHtml += `<text x="85" y="${530 + (i * 50)}" fill="${orange}" font-size="28" font-family="'Noto Sans KR', sans-serif" font-weight="700">${contentLines[i]}</text>`;
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

    const replyStartY = 520;
    let repliesHtml = '';
    for (let i = 0; i < replies.length; i++) {
      const r = replies[i];
      repliesHtml += `
        <text x="1210" y="${replyStartY + (i * 90)}" fill="${orange}" font-size="34" font-family="'Noto Sans KR', sans-serif" font-weight="700">${r.nick}</text>
        <text x="1210" y="${replyStartY + (i * 90) + 42}" fill="${dimOrange}" font-size="32" font-family="'Noto Sans KR', sans-serif" font-weight="700">${r.text}</text>
        <text x="1520" y="${replyStartY + (i * 90)}" fill="${dimOrange}" font-size="28" font-family="'Noto Sans KR', sans-serif" font-weight="700">[+${r.likes}]</text>
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
        
        <!-- 제목 + 작성자 -->
        <text x="85" y="440" fill="${titleColor}" font-size="35" font-family="'Noto Sans KR', sans-serif" font-weight="700">${prefix}${title}</text>
        <text x="85" y="475" fill="${dimOrange}" font-size="25" font-family="'Noto Sans KR', sans-serif" font-weight="700">${author}</text>
        
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
