// /functions/api/posts/[id]/comments.js
// Pages Functions - 댓글 + 대댓글 API (비밀번호 지원)

export async function onRequest(context) {
    const { request, env, params } = context;
    const postId = params.id;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, DELETE, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'POST') {
        return handleAddComment(postId, request, env, corsHeaders);
    }

    if (request.method === 'DELETE') {
        return handleDeleteComment(postId, request, env, corsHeaders);
    }

    if (request.method === 'PUT') {
        return handleEditComment(postId, request, env, corsHeaders);
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// 총 댓글 수 계산 함수
function countAllComments(comments) {
    let count = comments.length;
    comments.forEach(c => {
        if (c.replies && c.replies.length > 0) {
            count += c.replies.length;
        }
    });
    return count;
}

// 인덱스 댓글 수 업데이트 함수
async function updateCommentCount(postId, post, env) {
    const indexKey = 'posts:index';
    const existingIndex = await env.FROST_POSTS.get(indexKey);
    if (existingIndex) {
        const index = JSON.parse(existingIndex);
        const postIndex = index.findIndex(p => p.id === postId);
        if (postIndex !== -1) {
            index[postIndex].commentCount = countAllComments(post.comments || []);
            await env.FROST_POSTS.put(indexKey, JSON.stringify(index));
        }
    }
}

// 댓글/대댓글 추가
async function handleAddComment(postId, request, env, corsHeaders) {
    try {
        const { author, content, password, parentIndex } = await request.json();

        // 유효성 검사
        if (!author || !content || !password) {
            return new Response(JSON.stringify({ error: '닉네임, 내용, 비밀번호를 모두 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (author.length > 20) {
            return new Response(JSON.stringify({ error: '닉네임은 20자 이내로 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (password.length > 20) {
            return new Response(JSON.stringify({ error: '비밀번호는 20자 이내로 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const maxLength = parentIndex !== undefined ? 300 : 500;
        if (content.length > maxLength) {
            return new Response(JSON.stringify({ error: `내용은 ${maxLength}자 이내로 입력해주세요.` }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 글 가져오기
        const postData = await env.FROST_POSTS.get(`post:${postId}`);
        if (!postData) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const post = JSON.parse(postData);
        if (!post.comments) post.comments = [];

        // 대댓글인 경우
        if (parentIndex !== undefined && parentIndex !== null) {
            const parentComment = post.comments[parentIndex];
            if (!parentComment) {
                return new Response(JSON.stringify({ error: '부모 댓글을 찾을 수 없습니다.' }), {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (!parentComment.replies) parentComment.replies = [];
            
            if (parentComment.replies.length >= 20) {
                return new Response(JSON.stringify({ error: '답글은 최대 20개까지 작성할 수 있습니다.' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const reply = {
                id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                author,
                content,
                password,  // 비밀번호 저장
                createdAt: Date.now()
            };

            parentComment.replies.push(reply);
            await env.FROST_POSTS.put(`post:${postId}`, JSON.stringify(post));
            
            // 댓글 수 업데이트
            await updateCommentCount(postId, post, env);

            // 응답에서 비밀번호 제외
            const { password: _, ...safeReply } = reply;
            return new Response(JSON.stringify({ success: true, reply: safeReply }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 일반 댓글
        const comment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            author,
            content,
            password,  // 비밀번호 저장
            createdAt: Date.now(),
            replies: []
        };

        post.comments.push(comment);
        await env.FROST_POSTS.put(`post:${postId}`, JSON.stringify(post));
        
        // 댓글 수 업데이트
        await updateCommentCount(postId, post, env);

        // 응답에서 비밀번호 제외
        const { password: _, ...safeComment } = comment;
        return new Response(JSON.stringify({ success: true, comment: safeComment }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// 댓글/대댓글 삭제
async function handleDeleteComment(postId, request, env, corsHeaders) {
    try {
        const { commentIndex, replyIndex, password } = await request.json();

        if (!password) {
            return new Response(JSON.stringify({ error: '비밀번호를 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const postData = await env.FROST_POSTS.get(`post:${postId}`);
        if (!postData) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const post = JSON.parse(postData);

        if (!post.comments || !post.comments[commentIndex]) {
            return new Response(JSON.stringify({ error: '댓글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 대댓글 삭제
        if (replyIndex !== undefined && replyIndex !== null) {
            const comment = post.comments[commentIndex];
            if (!comment.replies || !comment.replies[replyIndex]) {
                return new Response(JSON.stringify({ error: '답글을 찾을 수 없습니다.' }), {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (comment.replies[replyIndex].password !== password) {
                return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            comment.replies.splice(replyIndex, 1);
        } else {
            // 댓글 삭제
            if (post.comments[commentIndex].password !== password) {
                return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            post.comments.splice(commentIndex, 1);
        }

        await env.FROST_POSTS.put(`post:${postId}`, JSON.stringify(post));
        await updateCommentCount(postId, post, env);

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

// 댓글/대댓글 수정
async function handleEditComment(postId, request, env, corsHeaders) {
    try {
        const { commentIndex, replyIndex, password, newContent } = await request.json();

        if (!password || !newContent) {
            return new Response(JSON.stringify({ error: '비밀번호와 내용을 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const maxLength = replyIndex !== undefined ? 300 : 500;
        if (newContent.length > maxLength) {
            return new Response(JSON.stringify({ error: `내용은 ${maxLength}자 이내로 입력해주세요.` }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const postData = await env.FROST_POSTS.get(`post:${postId}`);
        if (!postData) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const post = JSON.parse(postData);

        if (!post.comments || !post.comments[commentIndex]) {
            return new Response(JSON.stringify({ error: '댓글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 대댓글 수정
        if (replyIndex !== undefined && replyIndex !== null) {
            const comment = post.comments[commentIndex];
            if (!comment.replies || !comment.replies[replyIndex]) {
                return new Response(JSON.stringify({ error: '답글을 찾을 수 없습니다.' }), {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (comment.replies[replyIndex].password !== password) {
                return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            comment.replies[replyIndex].content = newContent;
            comment.replies[replyIndex].editedAt = Date.now();
        } else {
            // 댓글 수정
            if (post.comments[commentIndex].password !== password) {
                return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            post.comments[commentIndex].content = newContent;
            post.comments[commentIndex].editedAt = Date.now();
        }

        await env.FROST_POSTS.put(`post:${postId}`, JSON.stringify(post));

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}
