// 调试工具 - 在ChatGPT页面控制台运行此代码
(function() {
  console.log('=== AI对话监控助手 - 调试工具 ===');
  
  // 1. 检查插件是否加载
  console.log('\n1. 检查插件状态:');
  console.log('   Content Script已加载:', typeof ChatGPTAdapter !== 'undefined');
  console.log('   当前URL:', window.location.href);
  console.log('   当前域名:', window.location.hostname);
  
  // 2. 查找ChatGPT的消息容器
  console.log('\n2. 查找消息容器:');
  const containers = [
    { name: 'main', element: document.querySelector('main') },
    { name: '[role="main"]', element: document.querySelector('[role="main"]') },
    { name: 'body', element: document.body }
  ];
  containers.forEach(c => {
    console.log(`   ${c.name}:`, c.element ? '✅ 找到' : '❌ 未找到');
  });
  
  // 3. 查找消息元素
  console.log('\n3. 查找消息元素:');
  const messageSelectors = [
    '[data-message-author-role]',
    '[data-message-id]',
    '[class*="message"]',
    '[class*="Message"]',
    'div[role="presentation"]',
    'div[class*="group"]'
  ];
  
  messageSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`   ${selector}: 找到 ${elements.length} 个元素`);
      // 显示前3个元素的文本预览
      Array.from(elements).slice(0, 3).forEach((el, i) => {
        const text = el.textContent || el.innerText || '';
        if (text.length > 10) {
          console.log(`     元素${i + 1}:`, text.substring(0, 50) + '...');
        }
      });
    }
  });
  
  // 4. 详细分析消息结构
  console.log('\n4. 分析消息结构:');
  const testSelectors = [
    '[data-message-author-role="user"]',
    '[data-message-author-role="assistant"]',
    '[data-message-id]'
  ];
  
  testSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`   ${selector}:`);
      const firstEl = elements[0];
      console.log('     类名:', firstEl.className);
      console.log('     ID:', firstEl.id);
      console.log('     属性:', Array.from(firstEl.attributes).map(a => `${a.name}="${a.value}"`).join(', '));
      console.log('     文本长度:', (firstEl.textContent || '').length);
      console.log('     文本预览:', (firstEl.textContent || '').substring(0, 100));
      
      // 查找内容容器
      const contentSelectors = ['.markdown', '[class*="markdown"]', '.prose', '[class*="prose"]'];
      contentSelectors.forEach(cs => {
        const content = firstEl.querySelector(cs);
        if (content) {
          console.log(`     内容容器 ${cs}:`, content.textContent.substring(0, 50));
        }
      });
    }
  });
  
  // 5. 检查存储
  console.log('\n5. 检查存储数据:');
  chrome.storage.local.get(null, (items) => {
    const messageKeys = Object.keys(items).filter(k => k.startsWith('messages_'));
    console.log('   存储的消息键:', messageKeys);
    if (messageKeys.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const todayKey = `messages_${today}`;
      const todayMessages = items[todayKey] || [];
      console.log(`   今日(${today})消息数:`, todayMessages.length);
      if (todayMessages.length > 0) {
        console.log('   最新3条消息:');
        todayMessages.slice(-3).forEach((msg, i) => {
          console.log(`     ${i + 1}. [${msg.role}] ${msg.content.substring(0, 50)}...`);
        });
      }
    } else {
      console.log('   ⚠️ 暂无存储的消息');
    }
  });
  
  // 6. 测试适配器
  console.log('\n6. 测试适配器:');
  if (typeof ChatGPTAdapter !== 'undefined') {
    try {
      const adapter = new ChatGPTAdapter();
      const container = adapter.getContainer();
      console.log('   容器:', container ? container.tagName : 'null');
      
      const messages = adapter.getMessages();
      console.log('   找到消息数:', messages.length);
      
      if (messages.length > 0) {
        const firstMsg = adapter.extractMessage(messages[0]);
        if (firstMsg) {
          console.log('   第一条消息:', {
            role: firstMsg.role,
            contentLength: firstMsg.content.length,
            preview: firstMsg.content.substring(0, 50)
          });
        } else {
          console.log('   ⚠️ 无法提取消息内容');
        }
      }
    } catch (error) {
      console.error('   适配器测试失败:', error);
    }
  } else {
    console.log('   ⚠️ ChatGPTAdapter未定义');
  }
  
  // 7. 监听DOM变化
  console.log('\n7. 开始监听DOM变化（10秒）...');
  let mutationCount = 0;
  const observer = new MutationObserver((mutations) => {
    mutationCount++;
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            const msgEl = node.closest ? node.closest('[data-message-author-role]') : null;
            if (msgEl) {
              const role = msgEl.getAttribute('data-message-author-role');
              const text = msgEl.textContent || '';
              if (text.length > 10) {
                console.log(`   🆕 检测到新消息 [${role}]:`, text.substring(0, 50));
              }
            }
          }
        });
      }
    });
  });
  
  const mainContainer = document.querySelector('main') || document.body;
  observer.observe(mainContainer, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  setTimeout(() => {
    observer.disconnect();
    console.log(`   监听结束，共检测到 ${mutationCount} 次DOM变化`);
    console.log('\n=== 调试完成 ===');
    console.log('请发送一条消息，然后重新运行此脚本查看结果');
  }, 10000);
  
  console.log('\n💡 提示: 请在ChatGPT中发送一条消息，观察上面的输出');
})();


