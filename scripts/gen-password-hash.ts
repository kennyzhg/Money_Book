/**
 * 生成 bcrypt 密码哈希，写入环境变量 APP_PASSWORD_HASH
 *
 * 用法：
 *   npm run gen-password
 *   npx tsx scripts/gen-password-hash.ts
 *
 * 行为：
 * - TTY 环境：密码输入不回显（raw 模式，回车确认）
 * - 非 TTY 环境（管道/CI）：按行读取（明文），方便脚本化
 *   例：printf 'pass\npass\n' | npm run gen-password
 *
 * 把输出的整行 \$2a\$12\$... 哈希粘到 .env 的 APP_PASSWORD_HASH= 后面。
 */
import bcrypt from 'bcryptjs';
import { readSync } from 'node:fs';

const COST = 12;

/** TTY 下读取一行（不回显）；非 TTY 走同步按行读 */
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    // 非 TTY（管道、CI）：直接同步读取 fd 0 直到换行
    if (!process.stdin.isTTY) {
      process.stdout.write(prompt);
      const buf: Buffer[] = [];
      while (true) {
        const b = readByte(0);
        if (b === null) break; // EOF
        if (b === 0x0a || b === 0x0d) break; // \n \r
        buf.push(Buffer.from([b]));
      }
      process.stdout.write('\n');
      resolve(Buffer.concat(buf).toString('utf8'));
      return;
    }

    // TTY：手写 raw 模式 + 关回显
    process.stdout.write(prompt);
    const stdin = process.stdin;
    let data = '';
    const onData = (c: Buffer) => {
      const s = c.toString();
      if (s === '\n' || s === '\r' || s === '\r\n') {
        stdin.removeListener('data', onData);
        stdin.setRawMode?.(false);
        process.stdout.write('\n');
        resolve(data);
      } else if (s === '\u0003') {
        process.exit(1);
      } else if (s === '\u007f' || s === '\b') {
        if (data.length > 0) data = data.slice(0, -1);
      } else {
        data += s;
      }
    };
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/** 同步读 fd 上的 1 字节，EOF 返回 null */
function readByte(fd: number): number | null {
  const b = Buffer.alloc(1);
  try {
    const n = readSync(fd, b, 0, 1, null);
    return n === 0 ? null : b[0];
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== Money_Book 密码哈希生成器 ===\n');
  const pwd = await askHidden('请输入登录密码（≥ 8 位）: ');
  if (!pwd || pwd.length < 8) {
    console.error('✗ 密码至少 8 位，已退出。');
    process.exit(1);
  }
  const pwd2 = await askHidden('再输入一次确认: ');
  if (pwd !== pwd2) {
    console.error('✗ 两次输入不一致，已退出。');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(pwd, COST);
  console.log('\n✓ 哈希生成成功：\n');
  console.log(hash);
  console.log('\n请把上面的整串字符粘到 .env 文件中：');
  console.log(`APP_PASSWORD_HASH=${hash}`);
  console.log(`\n（bcrypt cost = ${COST}，重启服务后生效）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
