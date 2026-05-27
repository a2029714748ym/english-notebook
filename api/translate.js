// Vercel Serverless Function - 腾讯云翻译API代理
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, from = 'en', to = 'zh' } = req.body;

    if (!text) {
      return res.status(400).json({ error: '缺少翻译文本' });
    }

    // 从环境变量获取密钥
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;

    if (!secretId || !secretKey) {
      return res.status(500).json({ error: '未配置腾讯云密钥' });
    }

    // 调用腾讯云翻译API
    const result = await tencentTranslate(text, from, to, secretId, secretKey);

    return res.status(200).json({ translation: result });
  } catch (error) {
    console.error('翻译错误:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function tencentTranslate(text, from, to, secretId, secretKey) {
  const service = 'tmt';
  const action = 'TextTranslate';
  const version = '2018-03-21';
  const region = 'ap-guangzhou';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];

  const payload = JSON.stringify({
    SourceText: text,
    Source: from,
    Target: to,
    ProjectId: 0
  });

  // 构建规范请求串
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:tmt.tencentcloudapi.com\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedPayload = sha256(payload);
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;

  // 构建待签名字符串
  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = sha256(canonicalRequest);
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

  // 计算签名
  const secretDate = hmacSHA256(date, `TC3${secretKey}`);
  const secretService = hmacSHA256(service, secretDate);
  const secretSigning = hmacSHA256('tc3_request', secretService);
  const signature = hmacSHA256(stringToSign, secretSigning);

  // 构建Authorization头
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // 发送请求
  const response = await fetch('https://tmt.tencentcloudapi.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'tmt.tencentcloudapi.com',
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': timestamp.toString(),
      'X-TC-Region': region,
      'Authorization': authorization
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error('翻译请求失败');
  }

  const data = await response.json();

  if (data.Response?.Error) {
    throw new Error(data.Response.Error.Message || '翻译失败');
  }

  return data.Response?.TargetText || '';
}

function sha256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

function hmacSHA256(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}
