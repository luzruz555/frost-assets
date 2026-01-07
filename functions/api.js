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
    // ========== 홈 (목록) ==========
    const listRaw = decodeURIComponent(url.searchParams.get('l') || '');
    const posts = [];

    if (listRaw) {
      const items = listRaw.split('/./');
      for (let i = 0; i < Math.min(items.length, 5); i++) {
        const parts = items[i].split('|');
        posts.push({
          type: parts[0] || 'g',
          title: parts[1] || '',
          author: parts[2] || '',
          comments: parts[3] || '0',
          likes: parts[4] || '0',
          views: parts[5] || '0'
        });
      }
    }

    // 게시물 Y 좌표 (5개 박스) - 이미지 기준 조정
    const postY = [295, 455, 615, 775, 935];
    const titleY = postY.map(y => y + 45);
    const metaY = postY.map(y => y + 105);
    const commentY = postY.map(y => y + 75); // 댓글 수 Y좌표 (아래로)

    let postsHtml = '';
    for (let i = 0; i < 5; i++) {
      const p = posts[i] || { type: 'g', title: '', author: '', comments: '0', likes: '0', views: '0' };
      
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
        <text x="65" y="${metaY[i]}" fill="${dimOrange}" font-size="24" font-family="'Noto Sans KR', sans-serif">작성자: ${p.author}</text>
        <text x="350" y="${metaY[i]}" fill="${dimOrange}" font-size="24" font-family="'Noto Sans KR', sans-serif">조회수: ${p.views}</text>
        <text x="580" y="${metaY[i]}" fill="${dimOrange}" font-size="24" font-family="'Noto Sans KR', sans-serif">추천: ${p.likes}</text>
        <text x="915" y="${commentY[i]}" fill="${orange}" font-size="28" font-family="'Noto Sans KR', sans-serif" text-anchor="middle">${p.comments}</text>
      `;
    }

    // 배경 이미지 로드
    const bgBase64 = await loadImageBase64(homeBg);

    svg = `
      <svg width="1024" height="1300" viewBox="0 0 1024 1300" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&amp;display=swap');
          </style>
        </defs>
        <image href="data:image/png;base64,${bgBase64}" width="1024" height="1300"/>
        ${postsHtml}
      </svg>
    `;

  } else if (mode === 'p') {
    // ========== 포스트 (상세) ==========
    const type = decodeURIComponent(url.searchParams.get('y') || 'g');
    const title = decodeURIComponent(url.searchParams.get('t') || '');
    const author = decodeURIComponent(url.searchParams.get('a') || '');
    const date = decodeURIComponent(url.searchParams.get('d') || '');
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
        const charWidth = /[가-힣]/.test(char) ? 28 : 16;
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

    const contentLines = wrapText(content, 880);
    let contentHtml = '';
    for (let i = 0; i < contentLines.length; i++) {
      contentHtml += `<text x="65" y="${360 + (i * 40)}" fill="${orange}" font-size="28" font-family="'Noto Sans KR', sans-serif">${contentLines[i]}</text>`;
    }

    // 댓글 파싱
    const replies = [];
    if (repliesRaw) {
      const items = repliesRaw.split('/./');
      for (let i = 0; i < Math.min(items.length, 5); i++) {
        const parts = items[i].split('|');
        replies.push({
          nick: parts[0] || '',
          text: parts[1] || '',
          likes: parts[2] || '0'
        });
      }
    }

    const replyStartY = 920;
    let repliesHtml = '';
    for (let i = 0; i < replies.length; i++) {
      const r = replies[i];
      repliesHtml += `
        <text x="65" y="${replyStartY + (i * 65)}" fill="${orange}" font-size="24" font-family="'Noto Sans KR', sans-serif" font-weight="700">${r.nick}</text>
        <text x="65" y="${replyStartY + (i * 65) + 30}" fill="${dimOrange}" font-size="22" font-family="'Noto Sans KR', sans-serif">${r.text}</text>
        <text x="920" y="${replyStartY + (i * 65) + 15}" fill="${dimOrange}" font-size="20" font-family="'Noto Sans KR', sans-serif">[+${r.likes}]</text>
      `;
    }

    // 배경 이미지 로드
    const bgBase64 = await loadImageBase64(postBg);

    svg = `
      <svg width="1024" height="1300" viewBox="0 0 1024 1300" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&amp;display=swap');
          </style>
        </defs>
        <image href="data:image/png;base64,${bgBase64}" width="1024" height="1300"/>
        
        <!-- 제목 -->
        <text x="65" y="300" fill="${titleColor}" font-size="34" font-family="'Noto Sans KR', sans-serif" font-weight="700">${prefix}${title}</text>
        
        <!-- 본문 -->
        ${contentHtml}
        
        <!-- 메타 -->
        <text x="65" y="800" fill="${dimOrange}" font-size="24" font-family="'Noto Sans KR', sans-serif">작성자: ${author}</text>
        <text x="350" y="800" fill="${dimOrange}" font-size="24" font-family="'Noto Sans KR', sans-serif">조회수: ${views}</text>
        <text x="580" y="800" fill="${dimOrange}" font-size="24" font-family="'Noto Sans KR', sans-serif">추천: ${likes}</text>
        
        <!-- 댓글 -->
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
