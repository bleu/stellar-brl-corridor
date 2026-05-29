import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDI6XOFI3OSXKDPHRLPGKJGWHP37V2EFX3KUCQ6R2DUMIT2Y7JSJEHIL",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"QuoteNotFound"},
  4: {message:"QuoteExpired"},
  5: {message:"QuoteAlreadyConsumed"},
  6: {message:"PriceInvariantViolated"},
  7: {message:"InvalidExpiry"},
  8: {message:"InvalidAmount"},
  9: {message:"Overflow"}
}


/**
 * A locked SEP-38 firm quote. Amounts are in each asset's minor units
 * (USDC: 7 dp stroops; BRL: 2 dp centavos). `price` is `sell-per-buy` scaled
 * by `PRICE_SCALE`.
 */
export interface Quote {
  buy_amount: i128;
  consumed: boolean;
  expires_at_ledger: u32;
  fee_iof: i128;
  price: i128;
  sell_amount: i128;
}



export interface Client {
  /**
   * Construct and simulate a get_quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a quote if it still exists (returns `None` once it has expired out
   * of Temporary storage).
   */
  get_quote: ({quote_id}: {quote_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Quote>>>

  /**
   * Construct and simulate a is_active transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * True if the quote exists, is unconsumed, and has not expired.
   */
  is_active: ({quote_id}: {quote_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a lock_quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lock a firm quote until `now + ttl_ledgers`. Admin-authenticated.
   * 
   * Stores the quote in Temporary storage and re-derives the SEP-38 price
   * relation before persisting; an inconsistent quote traps.
   */
  lock_quote: ({quote_id, sell_amount, buy_amount, price, fee_iof, ttl_ledgers}: {quote_id: Buffer, sell_amount: i128, buy_amount: i128, price: i128, fee_iof: i128, ttl_ledgers: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a consume_quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Consume a locked quote at settlement, binding it to a SEP-31 transaction.
   * Fails if the quote is missing, expired, or already consumed.
   */
  consume_quote: ({quote_id, sep31_tx_id}: {quote_id: Buffer, sep31_tx_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin}: {admin: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAANUXVvdGVOb3RGb3VuZAAAAAAAAAMAAAAAAAAADFF1b3RlRXhwaXJlZAAAAAQAAAAAAAAAFFF1b3RlQWxyZWFkeUNvbnN1bWVkAAAABQAAAAAAAAAWUHJpY2VJbnZhcmlhbnRWaW9sYXRlZAAAAAAABgAAAAAAAAANSW52YWxpZEV4cGlyeQAAAAAAAAcAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAIAAAAAAAAAAhPdmVyZmxvdwAAAAk=",
        "AAAAAQAAAKBBIGxvY2tlZCBTRVAtMzggZmlybSBxdW90ZS4gQW1vdW50cyBhcmUgaW4gZWFjaCBhc3NldCdzIG1pbm9yIHVuaXRzCihVU0RDOiA3IGRwIHN0cm9vcHM7IEJSTDogMiBkcCBjZW50YXZvcykuIGBwcmljZWAgaXMgYHNlbGwtcGVyLWJ1eWAgc2NhbGVkCmJ5IGBQUklDRV9TQ0FMRWAuAAAAAAAAAAVRdW90ZQAAAAAAAAYAAAAAAAAACmJ1eV9hbW91bnQAAAAAAAsAAAAAAAAACGNvbnN1bWVkAAAAAQAAAAAAAAARZXhwaXJlc19hdF9sZWRnZXIAAAAAAAAEAAAAAAAAAAdmZWVfaW9mAAAAAAsAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAALc2VsbF9hbW91bnQAAAAACw==",
        "AAAABQAAAF5FbWl0dGVkIHdoZW4gYSBxdW90ZSBpcyBjb25zdW1lZCBhdCBzZXR0bGVtZW50LiBUb3BpYzogYHF1b3RlX3VzZWAsCmBxdW90ZV9pZGAsIGBzZXAzMV90eF9pZGAuAAAAAAAAAAAACFF1b3RlVXNlAAAAAQAAAAlxdW90ZV91c2UAAAAAAAAEAAAAAAAAAAhxdW90ZV9pZAAAA+4AAAAgAAAAAQAAAAAAAAALc2VwMzFfdHhfaWQAAAAD7gAAACAAAAABAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAAAAAAAAdmZWVfaW9mAAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAF5SZWFkIGEgcXVvdGUgaWYgaXQgc3RpbGwgZXhpc3RzIChyZXR1cm5zIGBOb25lYCBvbmNlIGl0IGhhcyBleHBpcmVkIG91dApvZiBUZW1wb3Jhcnkgc3RvcmFnZSkuAAAAAAAJZ2V0X3F1b3RlAAAAAAAAAQAAAAAAAAAIcXVvdGVfaWQAAAPuAAAAIAAAAAEAAAPoAAAH0AAAAAVRdW90ZQAAAA==",
        "AAAAAAAAAD1UcnVlIGlmIHRoZSBxdW90ZSBleGlzdHMsIGlzIHVuY29uc3VtZWQsIGFuZCBoYXMgbm90IGV4cGlyZWQuAAAAAAAACWlzX2FjdGl2ZQAAAAAAAAEAAAAAAAAACHF1b3RlX2lkAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAMFMb2NrIGEgZmlybSBxdW90ZSB1bnRpbCBgbm93ICsgdHRsX2xlZGdlcnNgLiBBZG1pbi1hdXRoZW50aWNhdGVkLgoKU3RvcmVzIHRoZSBxdW90ZSBpbiBUZW1wb3Jhcnkgc3RvcmFnZSBhbmQgcmUtZGVyaXZlcyB0aGUgU0VQLTM4IHByaWNlCnJlbGF0aW9uIGJlZm9yZSBwZXJzaXN0aW5nOyBhbiBpbmNvbnNpc3RlbnQgcXVvdGUgdHJhcHMuAAAAAAAACmxvY2tfcXVvdGUAAAAAAAYAAAAAAAAACHF1b3RlX2lkAAAD7gAAACAAAAAAAAAAC3NlbGxfYW1vdW50AAAAAAsAAAAAAAAACmJ1eV9hbW91bnQAAAAAAAsAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAHZmVlX2lvZgAAAAALAAAAAAAAAAt0dGxfbGVkZ2VycwAAAAAEAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAABQAAAEdFbWl0dGVkIHdoZW4gYSBmaXJtIHF1b3RlIGlzIGxvY2tlZC4gVG9waWM6IGBxdW90ZV9sb2NrZWRgLCBgcXVvdGVfaWRgLgAAAAAAAAAAC1F1b3RlTG9ja2VkAAAAAAEAAAAMcXVvdGVfbG9ja2VkAAAAAwAAAAAAAAAIcXVvdGVfaWQAAAPuAAAAIAAAAAEAAAAAAAAAEWV4cGlyZXNfYXRfbGVkZ2VyAAAAAAAABAAAAAAAAAAAAAAAB2ZlZV9pb2YAAAAACwAAAAAAAAAC",
        "AAAAAAAAAFpJbml0aWFsaXplIHdpdGggdGhlIGFkbWluICh0aGUgYW5jaG9yJ3MgYnVzaW5lc3Mgc2VydmVyKSB0aGF0IG1heSBsb2NrCmFuZCBjb25zdW1lIHF1b3Rlcy4AAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAIZDb25zdW1lIGEgbG9ja2VkIHF1b3RlIGF0IHNldHRsZW1lbnQsIGJpbmRpbmcgaXQgdG8gYSBTRVAtMzEgdHJhbnNhY3Rpb24uCkZhaWxzIGlmIHRoZSBxdW90ZSBpcyBtaXNzaW5nLCBleHBpcmVkLCBvciBhbHJlYWR5IGNvbnN1bWVkLgAAAAAADWNvbnN1bWVfcXVvdGUAAAAAAAACAAAAAAAAAAhxdW90ZV9pZAAAA+4AAAAgAAAAAAAAAAtzZXAzMV90eF9pZAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_quote: this.txFromJSON<Option<Quote>>,
        is_active: this.txFromJSON<boolean>,
        lock_quote: this.txFromJSON<Result<u32>>,
        consume_quote: this.txFromJSON<Result<void>>
  }
}