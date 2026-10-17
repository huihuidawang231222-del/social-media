import {createTask,addPosts,addComments,log,publicTask} from './model.mjs';
export class AccessRequired extends Error {constructor(message){super(message);this.name='AccessRequired';}}
export class Runner {
  constructor(store,browser){this.store=store;this.browser=browser;this.tasks=[];this.active=null;this.busy=false;this.closing=false;}
  async init(){this.tasks=await this.store.load();for(const t of this.tasks)if(['running','queued'].includes(t.status)){t.status='paused';log(t,'程序已重启，进度已保留；点击继续恢复');}await this.save();}
  save(){return this.store.save(this.tasks);}
  list(){return this.tasks.map(publicTask).reverse();}
  get(id){const t=this.tasks.find(t=>t.id===id);if(!t)throw new Error('任务不存在');return t;}
  async create(input){if(this.tasks.length>=100)throw new Error('任务已达到100个上限，请备份后整理本地任务文件');const t=createTask(input);this.tasks.push(t);await this.save();void this.pump();return publicTask(t);}
  async action(id,action){const t=this.get(id);
    if(action==='pause'){if(!['queued','running'].includes(t.status))throw new Error('任务当前不能暂停');t.status='paused';log(t,'已暂停；正在执行的本轮读取会保存后停止');}
    else if(action==='cancel'){if(['completed','cancelled'].includes(t.status))throw new Error('任务已经结束');t.status='cancelled';log(t,'已取消，保留已采集数据');}
    else if(action==='resume'){if(!['paused','waiting_login','failed'].includes(t.status))throw new Error('任务当前不能继续');if(!t.posts.length)t.searchIndex=0;t.status='queued';log(t,'等待继续执行');}
    else if(action==='retry'){if(['running','queued'].includes(t.status)||this.active===id)throw new Error('请先暂停并等待本轮结束');for(const p of t.posts)if(p.status==='failed'){p.status='pending';p.round=0;p.idle=0;p.error='';}t.status='queued';log(t,'重试失败帖子，已有评论继续去重');}
    else throw new Error('未知任务操作');
    await this.save();void this.pump();return publicTask(t);
  }
  async pump(){if(this.busy||this.closing||this.tasks.some(t=>t.status==='waiting_login'))return;this.busy=true;
    try{for(;;){const task=this.tasks.find(t=>t.status==='queued');if(!task||this.closing)break;this.active=task.id;task.status='running';await this.save();
      try{await this.run(task);}catch(e){if(task.status==='running'){task.status=e instanceof AccessRequired?'waiting_login':'failed';log(task,e instanceof AccessRequired?e.message:'任务失败：'+e.message);await this.save();}}
      this.active=null;
      if(this.tasks.some(t=>t.status==='waiting_login'))break;
    }}finally{this.busy=false;this.active=null;}
  }
  async check(t){await this.browser.checkAccess(t.config.platform);return t.status==='running';}
  async run(t){const b=this.browser;await b.prepare?.(t.config);await b.ensure();if(t.status!=='running')return;
    while(t.searchIndex<t.config.keywords.length&&t.posts.length<t.config.maxPosts){
      if(t.status!=='running')return;
      const keyword=t.config.keywords[t.searchIndex];log(t,`搜索关键词 ${t.searchIndex+1}/${t.config.keywords.length}：${keyword}`);await this.save();
      await b.search(t.config.platform,keyword);if(!await this.check(t))return;
      let idle=0;
      // Search checkpoints keep discovered URLs. Resume may rescan the current keyword and deduplicate.
      for(let round=0;round<12&&idle<3&&t.posts.length<t.config.maxPosts;round++){
        if(t.status!=='running')return;
        if(!await this.check(t))return;
        const added=addPosts(t,await b.links());idle=added?0:idle+1;t.searchRound=round+1;
        log(t,`搜索发现 ${t.posts.length}/${t.config.maxPosts} 个帖子`);await this.save();
        if(t.posts.length>=t.config.maxPosts||idle>=3)break;
        await b.scrollSearch();await b.wait(t.config.intervalMs);
      }
      if(t.status!=='running')return;
      t.searchIndex++;t.searchRound=0;await this.save();
    }
    if(!t.posts.length)throw new Error('未发现帖子链接：可能尚未登录、页面改版或关键词无结果；请查看浏览器，检查后点击继续重试');
    t.phase='collect';await this.save();
    for(const post of t.posts){if(t.status!=='running')return;if(['done','failed'].includes(post.status))continue;
      post.status='running';log(t,`采集第 ${t.posts.indexOf(post)+1}/${t.posts.length} 个帖子`);await this.save();
      try {
        await b.open(post.url);if(!await this.check(t))return;await b.prepareComments?.(t.config);
        // Restart at the loaded page on resume; stored comments are deduplicated.
        post.idle=0;
        const savedRounds=post.round;
        for(let round=0;round<80;round++){
          if(t.status!=='running')return;
          if(!await this.check(t))return;
          const rows=await b.extract(t.config);const added=addComments(t,post,rows);post.idle=added?0:post.idle+1;post.round++;
          log(t,`当前帖子 ${post.count}/${t.config.perPost} 条；累计 ${t.comments.length} 条`);await this.save();
          if(t.status!=='running')return;
          if(post.count>=t.config.perPost||(post.idle>=5&&round>=Math.min(savedRounds,79)))break;
          await b.scrollComments(t.config);await b.wait(t.config.intervalMs);
        }
        if(t.status!=='running')return;
        if(post.count===0)throw new Error('未提取到匹配评论：评论未加载、筛选无命中、无评论或适配需调整');
        post.status='done';post.error='';
      }catch(e){if(e instanceof AccessRequired)throw e;if(t.status!=='running')return;post.status='failed';post.error='页面加载或提取失败，请查看浏览器及选择器';log(t,'当前帖子失败，已记录并继续下一个');}
      await this.save();if(t.status!=='running')return;await b.wait(t.config.intervalMs);
    }
    if(t.status==='running'){t.status='completed';log(t,`任务结束：${t.comments.length} 条评论，${t.posts.filter(p=>p.status==='failed').length} 个帖子待重试；仅代表已加载样本`);await this.save();}
  }
  async shutdown(){this.closing=true;for(const t of this.tasks)if(['queued','running'].includes(t.status)){t.status='paused';log(t,'程序退出，进度已保存');}await this.save();await this.browser.close();}
}
