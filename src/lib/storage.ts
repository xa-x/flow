import * as fs from "fs";
import * as path from "path";
import { MEDIA_DIR } from "@/db";

export interface StoredObject {
  key: string;
  bytes: number;
}

export interface ObjectStore {
  put(key: string, data: Uint8Array): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

class LocalStore implements ObjectStore {
  constructor(private root: string) {
    fs.mkdirSync(root, { recursive: true });
  }
  async put(key: string, data: Uint8Array): Promise<StoredObject> {
    const dest = path.join(this.root, key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    return { key, bytes: data.byteLength };
  }
  async get(key: string): Promise<Uint8Array | null> {
    const dest = path.join(this.root, key);
    if (!fs.existsSync(dest)) return null;
    return new Uint8Array(fs.readFileSync(dest));
  }
  async remove(key: string) {
    const dest = path.join(this.root, key);
    try {
      fs.unlinkSync(dest);
    } catch {
      /* ignore */
    }
  }
}

export const objectStore: ObjectStore = new LocalStore(MEDIA_DIR);

export function mediaKey(orgId: string, filename: string) {
  return orgId ? path.posix.join(orgId, filename) : filename;
}
