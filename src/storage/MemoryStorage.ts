import {IStorage} from '../types';

/**
 * In memory storage
 */
export default class MemoryStorage implements IStorage {
  public values: {[key: string]: string};
  constructor() {
    this.values = {};
  }
  public getItem(keyName: string): string | null {
    return this.values.hasOwnProperty(keyName) ? this.values[keyName] : null;
  }
  public setItem(keyName: string, keyValue: string): void {
    this.values[keyName] = keyValue;
  }
  public removeItem(keyName: string): void {
    delete this.values[keyName];
  }
  public clear(): void {
    this.values = {};
  }
}
