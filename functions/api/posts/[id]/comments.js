// /functions/api/posts/[id]/comments.js
// D1 버전 - 댓글 + 대댓글 API

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

// 댓글 수 업데이트
async function updateCommentCount(postId, env) {
    const commentCount = await env.FROST_DB.prepare(`
        SELECT 
            (SELECT COUNT(*) FROM comments WHERE post_id = ?) +
            (SELECT COUNT(*) FROM replies WHERE comment_id IN (SELECT id FROM comments WHERE post_id = ?))
        as total
    `).bind(postId, postId).first();

    await env.FROST_DB.prepare(`
        UPDATE posts SET comment_count = ? WHERE id = ?
    `).bind(commentCount.total, postId).run();
}

// 댓글/대댓글 추가
async function handleAddComment(postId, request, env, corsHeaders) {
    try {
        const { author, content, password, parentCommentId } = await request.json();

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

        const maxLength = parentCommentId ? 300 : 500;
        if (content.length > maxLength) {
            return new Response(JSON.stringify({ error: `내용은 ${maxLength}자 이내로 입력해주세요.` }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 글 존재 확인
        const post = await env.FROST_DB.prepare(`SELECT id FROM posts WHERE id = ?`).bind(postId).first();
        if (!post) {
            return new Response(JSON.stringify({ error: '글을 찾을 수 없습니다.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const id = `${parentCommentId ? 'reply' : 'comment'}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const now = Date.now();

        // 대댓글인 경우
        if (parentCommentId) {
            // 부모 댓글 존재 확인
            const parentComment = await env.FROST_DB.prepare(`SELECT id FROM comments WHERE id = ?`).bind(parentCommentId).first();
            if (!parentComment) {
                return new Response(JSON.stringify({ error: '부모 댓글을 찾을 수 없습니다.' }), {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 대댓글 20개 제한
            const replyCount = await env.FROST_DB.prepare(`
                SELECT COUNT(*) as count FROM replies WHERE comment_id = ?
            `).bind(parentCommentId).first();

            if (replyCount.count >= 20) {
                return new Response(JSON.stringify({ error: '답글은 최대 20개까지 작성할 수 있습니다.' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            await env.FROST_DB.prepare(`
                INSERT INTO replies (id, comment_id, author, content, password, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(id, parentCommentId, author, content, password, now).run();

        } else {
            // 일반 댓글
            await env.FROST_DB.prepare(`
                INSERT INTO comments (id, post_id, author, content, password, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(id, postId, author, content, password, now).run();
        }

        await updateCommentCount(postId, env);

        return new Response(JSON.stringify({ success: true, id }), {
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
        const { commentId, replyId, password } = await request.json();

        if (!password) {
            return new Response(JSON.stringify({ error: '비밀번호를 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 대댓글 삭제
        if (replyId) {
            const reply = await env.FROST_DB.prepare(`SELECT password FROM replies WHERE id = ?`).bind(replyId).first();
            if (!reply) {
                return new Response(JSON.stringify({ error: '답글을 찾을 수 없습니다.' }), {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            if (reply.password !== password) {
                return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            await env.FROST_DB.prepare(`DELETE FROM replies WHERE id = ?`).bind(replyId).run();

        } else {
            // 댓글 삭제
            const comment = await env.FROST_DB.prepare(`SELECT password FROM comments WHERE id = ?`).bind(commentId).first();
            if (!comment) {
                return new Response(JSON.stringify({ error: '댓글을 찾을 수 없습니다.' }), {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            if (comment.password !== password) {
                return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 대댓글 먼저 삭제
            await env.FROST_DB.prepare(`DELETE FROM replies WHERE comment_id = ?`).bind(commentId).run();
            await env.FROST_DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(commentId).run();
        }

        await updateCommentCount(postId, env);

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
        const { commentId, replyId, password, newContent } = await request.json();

        if (!password || !newContent) {
            return new Response(JSON.stringify({ error: '비밀번호와 내용을 입력해주세요.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const maxLength = replyId ? 300 : 500;
        if (newContent.length > maxLength) {
            return new Response(JSON.stringify({ error: `내용은 ${maxLength}자 이내로 입력해주세요.` }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const now = Date.now();

        // 대댓글 수정
        if (replyId) {
            const reply = await env.FROST_DB.prepare(`SELECT password FROM replies WHERE id = ?`).bind(replyId).first();
            if (!reply) {
                return new Response(JSON.stringify({ error: '답글을 찾을 수 없습니다.' }), {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            if (reply.password !== password) {
                return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            await env.FROST_DB.prepare(`
                UPDATE replies SET content = ?, edited_at = ? WHERE id = ?
            `).bind(newContent, now, replyId).run();

        } else {
            // 댓글 수정
            const comment = await env.FROST_DB.prepare(`SELECT password FROM comments WHERE id = ?`).bind(commentId).first();
            if (!comment) {
                return new Response(JSON.stringify({ error: '댓글을 찾을 수 없습니다.' }), {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            if (comment.password !== password) {
                return new Response(JSON.stringify({ error: '비밀번호가 일치하지 않습니다.' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
            await env.FROST_DB.prepare(`
                UPDATE comments SET content = ?, edited_at = ? WHERE id = ?
            `).bind(newContent, now, commentId).run();
        }

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
