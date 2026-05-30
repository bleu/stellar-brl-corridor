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
    contractId: "CDZLXRAWDHU6JLDAU5PRTYC3NNXWRWXIDTPJNOTIHIMLVAPSA5JONVRW",
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
   * Construct and simulate a has_role transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns `Some(index)` if the account has the specified role,
   * where `index` is the position of the account for that role,
   * and can be used to query [`AccessControl::get_role_member()`].
   * Returns `None` if the account does not have the specified role.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `account` - The account to check.
   * * `role` - The role to check for.
   */
  has_role: ({account, role}: {account: string, role: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<u32>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the admin account.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

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
   * Construct and simulate a grant_role transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Grants a role to an account.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `account` - The account to grant the role to.
   * * `role` - The role to grant.
   * * `caller` - The address of the caller, must be the admin or have the
   * `RoleAdmin` for the `role`.
   * 
   * # Errors
   * 
   * * [`AccessControlError::Unauthorized`] - If the caller does not have
   * enough privileges.
   * * [`AccessControlError::MaxRolesExceeded`] - If adding a new role would
   * exceed the maximum allowed number of roles.
   * 
   * # Events
   * 
   * * topics - `["role_granted", role: Symbol, account: Address]`
   * * data - `[caller: Address]`
   */
  grant_role: ({account, role, caller}: {account: string, role: string, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a lock_quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lock a firm quote until `now + ttl_ledgers`. Admin-gated via OZ access
   * control.
   * 
   * Stores the quote in Temporary storage and re-derives the SEP-38 price
   * relation before persisting; an inconsistent quote traps.
   */
  lock_quote: ({quote_id, sell_amount, buy_amount, price, fee_iof, ttl_ledgers}: {quote_id: Buffer, sell_amount: i128, buy_amount: i128, price: i128, fee_iof: i128, ttl_ledgers: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a revoke_role transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revokes a role from an account.
   * To revoke the caller's own role, use
   * [`AccessControl::renounce_role()`] instead.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `account` - The account to revoke the role from.
   * * `role` - The role to revoke.
   * * `caller` - The address of the caller, must be the admin or has the
   * `RoleAdmin` for the `role`.
   * 
   * # Errors
   * 
   * * [`AccessControlError::Unauthorized`] - If the `caller` does not have
   * enough privileges.
   * * [`AccessControlError::RoleNotHeld`] - If the `account` doesn't have
   * the role.
   * * [`AccessControlError::RoleIsEmpty`] - If the role has no members.
   * 
   * # Events
   * 
   * * topics - `["role_revoked", role: Symbol, account: Address]`
   * * data - `[caller: Address]`
   */
  revoke_role: ({account, role, caller}: {account: string, role: string, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a consume_quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Consume a locked quote at settlement, binding it to a SEP-31 transaction.
   * Fails if the quote is missing, expired, or already consumed. Admin-gated
   * via OZ access control.
   */
  consume_quote: ({quote_id, sep31_tx_id}: {quote_id: Buffer, sep31_tx_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a renounce_role transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Allows an account to renounce a role assigned to itself.
   * Users can only renounce roles for their own account.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `role` - The role to renounce.
   * * `caller` - The address of the caller, must be the account that has the
   * role.
   * 
   * # Errors
   * 
   * * [`AccessControlError::RoleNotHeld`] - If the `caller` doesn't have the
   * role.
   * * [`AccessControlError::RoleIsEmpty`] - If the role has no members.
   * 
   * # Events
   * 
   * * topics - `["role_revoked", role: Symbol, account: Address]`
   * * data - `[caller: Address]`
   */
  renounce_role: ({role, caller}: {role: string, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_role_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the admin role for a specific role.
   * If no admin role is explicitly set, returns `None`.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `role` - The role to query the admin role for.
   */
  get_role_admin: ({role}: {role: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a renounce_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Allows the current admin to renounce their role, making the contract
   * permanently admin-less. This is useful for decentralization purposes
   * or when the admin role is no longer needed. Once the admin is
   * renounced, it cannot be reinstated.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * 
   * # Errors
   * 
   * * [`AccessControlError::AdminNotSet`] - If no admin account is set.
   * 
   * # Events
   * 
   * * topics - `["admin_renounced", admin: Address]`
   * * data - `[]`
   * 
   * # Notes
   * 
   * * Authorization for the current admin is required.
   */
  renounce_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_role_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sets `admin_role` as the admin role of `role`.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `role` - The role to set the admin for.
   * * `admin_role` - The new admin role.
   * 
   * # Events
   * 
   * * topics - `["role_admin_changed", role: Symbol]`
   * * data - `[previous_admin_role: Symbol, new_admin_role: Symbol]`
   * 
   * # Errors
   * 
   * * [`AccessControlError::AdminNotSet`] - If admin account is not set.
   * 
   * # Notes
   * 
   * * Authorization for the current admin is required.
   */
  set_role_admin: ({role, admin_role}: {role: string, admin_role: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_role_member transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the account at the specified index for a given role.
   * 
   * A function to get all members of a role is not provided because that
   * would be unbounded. To enumerate all members of a role, use
   * [`AccessControl::get_role_member_count()`] to get the total number of
   * members and then use [`AccessControl::get_role_member()`] to retrieve
   * each member one by one.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `role` - The role to query.
   * * `index` - The index of the account to retrieve.
   * 
   * # Errors
   * 
   * * [`AccessControlError::IndexOutOfBounds`] - If the index is out of
   * bounds for the role's member list.
   */
  get_role_member: ({role, index}: {role: string, index: u32}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_existing_roles transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns a vector containing all existing roles.
   * Defaults to empty vector if no roles exist.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * 
   * # Notes
   * 
   * This function returns all roles that currently have at least one member.
   * The maximum number of roles is limited by [`MAX_ROLES`].
   */
  get_existing_roles: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a transfer_admin_role transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initiates the admin role transfer.
   * Admin privileges for the current admin are not revoked until the
   * recipient accepts the transfer.
   * Overrides the previous pending transfer if there is one.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `new_admin` - The account to transfer the admin privileges to.
   * * `live_until_ledger` - The ledger number at which the pending transfer
   * expires. If `live_until_ledger` is `0`, the pending transfer is
   * cancelled. `live_until_ledger` argument is implicitly bounded by the
   * maximum allowed TTL extension for a temporary storage entry and
   * specifying a higher value will cause the code to panic.
   * 
   * # Errors
   * 
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * trying to cancel a transfer that doesn't exist.
   * * [`crate::role_transfer::RoleTransferError::InvalidLiveUntilLedger`] -
   * If the specified ledger is in the past.
   * * [`crate::role_transfer::RoleTransferError::InvalidPendingAccount`] -
   * If the specified pending account is not the same as the provided `new`
   * address.
   * 
   */
  transfer_admin_role: ({new_admin, live_until_ledger}: {new_admin: string, live_until_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a accept_admin_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Completes the 2-step admin transfer.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * 
   * # Events
   * 
   * * topics - `["admin_transfer_completed", new_admin: Address]`
   * * data - `[previous_admin: Address]`
   * 
   * # Errors
   * 
   * * [`crate::role_transfer::RoleTransferError::NoPendingTransfer`] - If
   * there is no pending transfer to accept.
   * * [`AccessControlError::AdminNotSet`] - If admin account is not set.
   */
  accept_admin_transfer: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_role_member_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the total number of accounts that have the specified role.
   * If the role does not exist, returns 0.
   * 
   * # Arguments
   * 
   * * `e` - Access to Soroban environment.
   * * `role` - The role to get the count for.
   */
  get_role_member_count: ({role}: {role: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

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
        "AAAAAAAAAXJSZXR1cm5zIGBTb21lKGluZGV4KWAgaWYgdGhlIGFjY291bnQgaGFzIHRoZSBzcGVjaWZpZWQgcm9sZSwKd2hlcmUgYGluZGV4YCBpcyB0aGUgcG9zaXRpb24gb2YgdGhlIGFjY291bnQgZm9yIHRoYXQgcm9sZSwKYW5kIGNhbiBiZSB1c2VkIHRvIHF1ZXJ5IFtgQWNjZXNzQ29udHJvbDo6Z2V0X3JvbGVfbWVtYmVyKClgXS4KUmV0dXJucyBgTm9uZWAgaWYgdGhlIGFjY291bnQgZG9lcyBub3QgaGF2ZSB0aGUgc3BlY2lmaWVkIHJvbGUuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgYWNjb3VudGAgLSBUaGUgYWNjb3VudCB0byBjaGVjay4KKiBgcm9sZWAgLSBUaGUgcm9sZSB0byBjaGVjayBmb3IuAAAAAAAIaGFzX3JvbGUAAAACAAAAAAAAAAdhY2NvdW50AAAAABMAAAAAAAAABHJvbGUAAAARAAAAAQAAA+gAAAAE",
        "AAAAAAAAAE9SZXR1cm5zIHRoZSBhZG1pbiBhY2NvdW50LgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIFNvcm9iYW4gZW52aXJvbm1lbnQuAAAAAAlnZXRfYWRtaW4AAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAAF5SZWFkIGEgcXVvdGUgaWYgaXQgc3RpbGwgZXhpc3RzIChyZXR1cm5zIGBOb25lYCBvbmNlIGl0IGhhcyBleHBpcmVkIG91dApvZiBUZW1wb3Jhcnkgc3RvcmFnZSkuAAAAAAAJZ2V0X3F1b3RlAAAAAAAAAQAAAAAAAAAIcXVvdGVfaWQAAAPuAAAAIAAAAAEAAAPoAAAH0AAAAAVRdW90ZQAAAA==",
        "AAAAAAAAAD1UcnVlIGlmIHRoZSBxdW90ZSBleGlzdHMsIGlzIHVuY29uc3VtZWQsIGFuZCBoYXMgbm90IGV4cGlyZWQuAAAAAAAACWlzX2FjdGl2ZQAAAAAAAAEAAAAAAAAACHF1b3RlX2lkAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAj5HcmFudHMgYSByb2xlIHRvIGFuIGFjY291bnQuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgYWNjb3VudGAgLSBUaGUgYWNjb3VudCB0byBncmFudCB0aGUgcm9sZSB0by4KKiBgcm9sZWAgLSBUaGUgcm9sZSB0byBncmFudC4KKiBgY2FsbGVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBjYWxsZXIsIG11c3QgYmUgdGhlIGFkbWluIG9yIGhhdmUgdGhlCmBSb2xlQWRtaW5gIGZvciB0aGUgYHJvbGVgLgoKIyBFcnJvcnMKCiogW2BBY2Nlc3NDb250cm9sRXJyb3I6OlVuYXV0aG9yaXplZGBdIC0gSWYgdGhlIGNhbGxlciBkb2VzIG5vdCBoYXZlCmVub3VnaCBwcml2aWxlZ2VzLgoqIFtgQWNjZXNzQ29udHJvbEVycm9yOjpNYXhSb2xlc0V4Y2VlZGVkYF0gLSBJZiBhZGRpbmcgYSBuZXcgcm9sZSB3b3VsZApleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCBudW1iZXIgb2Ygcm9sZXMuCgojIEV2ZW50cwoKKiB0b3BpY3MgLSBgWyJyb2xlX2dyYW50ZWQiLCByb2xlOiBTeW1ib2wsIGFjY291bnQ6IEFkZHJlc3NdYAoqIGRhdGEgLSBgW2NhbGxlcjogQWRkcmVzc11gAAAAAAAKZ3JhbnRfcm9sZQAAAAAAAwAAAAAAAAAHYWNjb3VudAAAAAATAAAAAAAAAARyb2xlAAAAEQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAA==",
        "AAAAAAAAAM9Mb2NrIGEgZmlybSBxdW90ZSB1bnRpbCBgbm93ICsgdHRsX2xlZGdlcnNgLiBBZG1pbi1nYXRlZCB2aWEgT1ogYWNjZXNzCmNvbnRyb2wuCgpTdG9yZXMgdGhlIHF1b3RlIGluIFRlbXBvcmFyeSBzdG9yYWdlIGFuZCByZS1kZXJpdmVzIHRoZSBTRVAtMzggcHJpY2UKcmVsYXRpb24gYmVmb3JlIHBlcnNpc3Rpbmc7IGFuIGluY29uc2lzdGVudCBxdW90ZSB0cmFwcy4AAAAACmxvY2tfcXVvdGUAAAAAAAYAAAAAAAAACHF1b3RlX2lkAAAD7gAAACAAAAAAAAAAC3NlbGxfYW1vdW50AAAAAAsAAAAAAAAACmJ1eV9hbW91bnQAAAAAAAsAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAHZmVlX2lvZgAAAAALAAAAAAAAAAt0dGxfbGVkZ2VycwAAAAAEAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAABQAAAEdFbWl0dGVkIHdoZW4gYSBmaXJtIHF1b3RlIGlzIGxvY2tlZC4gVG9waWM6IGBxdW90ZV9sb2NrZWRgLCBgcXVvdGVfaWRgLgAAAAAAAAAAC1F1b3RlTG9ja2VkAAAAAAEAAAAMcXVvdGVfbG9ja2VkAAAAAwAAAAAAAAAIcXVvdGVfaWQAAAPuAAAAIAAAAAEAAAAAAAAAEWV4cGlyZXNfYXRfbGVkZ2VyAAAAAAAABAAAAAAAAAAAAAAAB2ZlZV9pb2YAAAAACwAAAAAAAAAC",
        "AAAAAAAAArdSZXZva2VzIGEgcm9sZSBmcm9tIGFuIGFjY291bnQuClRvIHJldm9rZSB0aGUgY2FsbGVyJ3Mgb3duIHJvbGUsIHVzZQpbYEFjY2Vzc0NvbnRyb2w6OnJlbm91bmNlX3JvbGUoKWBdIGluc3RlYWQuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgYWNjb3VudGAgLSBUaGUgYWNjb3VudCB0byByZXZva2UgdGhlIHJvbGUgZnJvbS4KKiBgcm9sZWAgLSBUaGUgcm9sZSB0byByZXZva2UuCiogYGNhbGxlcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgY2FsbGVyLCBtdXN0IGJlIHRoZSBhZG1pbiBvciBoYXMgdGhlCmBSb2xlQWRtaW5gIGZvciB0aGUgYHJvbGVgLgoKIyBFcnJvcnMKCiogW2BBY2Nlc3NDb250cm9sRXJyb3I6OlVuYXV0aG9yaXplZGBdIC0gSWYgdGhlIGBjYWxsZXJgIGRvZXMgbm90IGhhdmUKZW5vdWdoIHByaXZpbGVnZXMuCiogW2BBY2Nlc3NDb250cm9sRXJyb3I6OlJvbGVOb3RIZWxkYF0gLSBJZiB0aGUgYGFjY291bnRgIGRvZXNuJ3QgaGF2ZQp0aGUgcm9sZS4KKiBbYEFjY2Vzc0NvbnRyb2xFcnJvcjo6Um9sZUlzRW1wdHlgXSAtIElmIHRoZSByb2xlIGhhcyBubyBtZW1iZXJzLgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsicm9sZV9yZXZva2VkIiwgcm9sZTogU3ltYm9sLCBhY2NvdW50OiBBZGRyZXNzXWAKKiBkYXRhIC0gYFtjYWxsZXI6IEFkZHJlc3NdYAAAAAALcmV2b2tlX3JvbGUAAAAAAwAAAAAAAAAHYWNjb3VudAAAAAATAAAAAAAAAARyb2xlAAAAEQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAA==",
        "AAAAAAAAAIpJbml0aWFsaXplIHdpdGggdGhlIGFkbWluICh0aGUgYW5jaG9yJ3MgYnVzaW5lc3Mgc2VydmVyKSB0aGF0IG1heSBsb2NrCmFuZCBjb25zdW1lIHF1b3Rlcy4gQWRtaW4gZ2F0aW5nIGlzIGRlbGVnYXRlZCB0byBPWiBhY2Nlc3MgY29udHJvbC4AAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAKlDb25zdW1lIGEgbG9ja2VkIHF1b3RlIGF0IHNldHRsZW1lbnQsIGJpbmRpbmcgaXQgdG8gYSBTRVAtMzEgdHJhbnNhY3Rpb24uCkZhaWxzIGlmIHRoZSBxdW90ZSBpcyBtaXNzaW5nLCBleHBpcmVkLCBvciBhbHJlYWR5IGNvbnN1bWVkLiBBZG1pbi1nYXRlZAp2aWEgT1ogYWNjZXNzIGNvbnRyb2wuAAAAAAAADWNvbnN1bWVfcXVvdGUAAAAAAAACAAAAAAAAAAhxdW90ZV9pZAAAA+4AAAAgAAAAAAAAAAtzZXAzMV90eF9pZAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAhZBbGxvd3MgYW4gYWNjb3VudCB0byByZW5vdW5jZSBhIHJvbGUgYXNzaWduZWQgdG8gaXRzZWxmLgpVc2VycyBjYW4gb25seSByZW5vdW5jZSByb2xlcyBmb3IgdGhlaXIgb3duIGFjY291bnQuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgcm9sZWAgLSBUaGUgcm9sZSB0byByZW5vdW5jZS4KKiBgY2FsbGVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBjYWxsZXIsIG11c3QgYmUgdGhlIGFjY291bnQgdGhhdCBoYXMgdGhlCnJvbGUuCgojIEVycm9ycwoKKiBbYEFjY2Vzc0NvbnRyb2xFcnJvcjo6Um9sZU5vdEhlbGRgXSAtIElmIHRoZSBgY2FsbGVyYCBkb2Vzbid0IGhhdmUgdGhlCnJvbGUuCiogW2BBY2Nlc3NDb250cm9sRXJyb3I6OlJvbGVJc0VtcHR5YF0gLSBJZiB0aGUgcm9sZSBoYXMgbm8gbWVtYmVycy4KCiMgRXZlbnRzCgoqIHRvcGljcyAtIGBbInJvbGVfcmV2b2tlZCIsIHJvbGU6IFN5bWJvbCwgYWNjb3VudDogQWRkcmVzc11gCiogZGF0YSAtIGBbY2FsbGVyOiBBZGRyZXNzXWAAAAAAAA1yZW5vdW5jZV9yb2xlAAAAAAAAAgAAAAAAAAAEcm9sZQAAABEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAA=",
        "AAAAAAAAAMVSZXR1cm5zIHRoZSBhZG1pbiByb2xlIGZvciBhIHNwZWNpZmljIHJvbGUuCklmIG5vIGFkbWluIHJvbGUgaXMgZXhwbGljaXRseSBzZXQsIHJldHVybnMgYE5vbmVgLgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYHJvbGVgIC0gVGhlIHJvbGUgdG8gcXVlcnkgdGhlIGFkbWluIHJvbGUgZm9yLgAAAAAAAA5nZXRfcm9sZV9hZG1pbgAAAAAAAQAAAAAAAAAEcm9sZQAAABEAAAABAAAD6AAAABE=",
        "AAAAAAAAAfZBbGxvd3MgdGhlIGN1cnJlbnQgYWRtaW4gdG8gcmVub3VuY2UgdGhlaXIgcm9sZSwgbWFraW5nIHRoZSBjb250cmFjdApwZXJtYW5lbnRseSBhZG1pbi1sZXNzLiBUaGlzIGlzIHVzZWZ1bCBmb3IgZGVjZW50cmFsaXphdGlvbiBwdXJwb3NlcwpvciB3aGVuIHRoZSBhZG1pbiByb2xlIGlzIG5vIGxvbmdlciBuZWVkZWQuIE9uY2UgdGhlIGFkbWluIGlzCnJlbm91bmNlZCwgaXQgY2Fubm90IGJlIHJlaW5zdGF0ZWQuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgRXJyb3JzCgoqIFtgQWNjZXNzQ29udHJvbEVycm9yOjpBZG1pbk5vdFNldGBdIC0gSWYgbm8gYWRtaW4gYWNjb3VudCBpcyBzZXQuCgojIEV2ZW50cwoKKiB0b3BpY3MgLSBgWyJhZG1pbl9yZW5vdW5jZWQiLCBhZG1pbjogQWRkcmVzc11gCiogZGF0YSAtIGBbXWAKCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgYWRtaW4gaXMgcmVxdWlyZWQuAAAAAAAOcmVub3VuY2VfYWRtaW4AAAAAAAAAAAAA",
        "AAAAAAAAAb1TZXRzIGBhZG1pbl9yb2xlYCBhcyB0aGUgYWRtaW4gcm9sZSBvZiBgcm9sZWAuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gU29yb2JhbiBlbnZpcm9ubWVudC4KKiBgcm9sZWAgLSBUaGUgcm9sZSB0byBzZXQgdGhlIGFkbWluIGZvci4KKiBgYWRtaW5fcm9sZWAgLSBUaGUgbmV3IGFkbWluIHJvbGUuCgojIEV2ZW50cwoKKiB0b3BpY3MgLSBgWyJyb2xlX2FkbWluX2NoYW5nZWQiLCByb2xlOiBTeW1ib2xdYAoqIGRhdGEgLSBgW3ByZXZpb3VzX2FkbWluX3JvbGU6IFN5bWJvbCwgbmV3X2FkbWluX3JvbGU6IFN5bWJvbF1gCgojIEVycm9ycwoKKiBbYEFjY2Vzc0NvbnRyb2xFcnJvcjo6QWRtaW5Ob3RTZXRgXSAtIElmIGFkbWluIGFjY291bnQgaXMgbm90IHNldC4KCiMgTm90ZXMKCiogQXV0aG9yaXphdGlvbiBmb3IgdGhlIGN1cnJlbnQgYWRtaW4gaXMgcmVxdWlyZWQuAAAAAAAADnNldF9yb2xlX2FkbWluAAAAAAACAAAAAAAAAARyb2xlAAAAEQAAAAAAAAAKYWRtaW5fcm9sZQAAAAAAEQAAAAA=",
        "AAAAAAAAAllSZXR1cm5zIHRoZSBhY2NvdW50IGF0IHRoZSBzcGVjaWZpZWQgaW5kZXggZm9yIGEgZ2l2ZW4gcm9sZS4KCkEgZnVuY3Rpb24gdG8gZ2V0IGFsbCBtZW1iZXJzIG9mIGEgcm9sZSBpcyBub3QgcHJvdmlkZWQgYmVjYXVzZSB0aGF0CndvdWxkIGJlIHVuYm91bmRlZC4gVG8gZW51bWVyYXRlIGFsbCBtZW1iZXJzIG9mIGEgcm9sZSwgdXNlCltgQWNjZXNzQ29udHJvbDo6Z2V0X3JvbGVfbWVtYmVyX2NvdW50KClgXSB0byBnZXQgdGhlIHRvdGFsIG51bWJlciBvZgptZW1iZXJzIGFuZCB0aGVuIHVzZSBbYEFjY2Vzc0NvbnRyb2w6OmdldF9yb2xlX21lbWJlcigpYF0gdG8gcmV0cmlldmUKZWFjaCBtZW1iZXIgb25lIGJ5IG9uZS4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byBTb3JvYmFuIGVudmlyb25tZW50LgoqIGByb2xlYCAtIFRoZSByb2xlIHRvIHF1ZXJ5LgoqIGBpbmRleGAgLSBUaGUgaW5kZXggb2YgdGhlIGFjY291bnQgdG8gcmV0cmlldmUuCgojIEVycm9ycwoKKiBbYEFjY2Vzc0NvbnRyb2xFcnJvcjo6SW5kZXhPdXRPZkJvdW5kc2BdIC0gSWYgdGhlIGluZGV4IGlzIG91dCBvZgpib3VuZHMgZm9yIHRoZSByb2xlJ3MgbWVtYmVyIGxpc3QuAAAAAAAAD2dldF9yb2xlX21lbWJlcgAAAAACAAAAAAAAAARyb2xlAAAAEQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAABM=",
        "AAAAAAAAARxSZXR1cm5zIGEgdmVjdG9yIGNvbnRhaW5pbmcgYWxsIGV4aXN0aW5nIHJvbGVzLgpEZWZhdWx0cyB0byBlbXB0eSB2ZWN0b3IgaWYgbm8gcm9sZXMgZXhpc3QuCgojIEFyZ3VtZW50cwoKKiBgZWAgLSBBY2Nlc3MgdG8gU29yb2JhbiBlbnZpcm9ubWVudC4KCiMgTm90ZXMKClRoaXMgZnVuY3Rpb24gcmV0dXJucyBhbGwgcm9sZXMgdGhhdCBjdXJyZW50bHkgaGF2ZSBhdCBsZWFzdCBvbmUgbWVtYmVyLgpUaGUgbWF4aW11bSBudW1iZXIgb2Ygcm9sZXMgaXMgbGltaXRlZCBieSBbYE1BWF9ST0xFU2BdLgAAABJnZXRfZXhpc3Rpbmdfcm9sZXMAAAAAAAAAAAABAAAD6gAAABE=",
        "AAAAAAAABABJbml0aWF0ZXMgdGhlIGFkbWluIHJvbGUgdHJhbnNmZXIuCkFkbWluIHByaXZpbGVnZXMgZm9yIHRoZSBjdXJyZW50IGFkbWluIGFyZSBub3QgcmV2b2tlZCB1bnRpbCB0aGUKcmVjaXBpZW50IGFjY2VwdHMgdGhlIHRyYW5zZmVyLgpPdmVycmlkZXMgdGhlIHByZXZpb3VzIHBlbmRpbmcgdHJhbnNmZXIgaWYgdGhlcmUgaXMgb25lLgoKIyBBcmd1bWVudHMKCiogYGVgIC0gQWNjZXNzIHRvIFNvcm9iYW4gZW52aXJvbm1lbnQuCiogYG5ld19hZG1pbmAgLSBUaGUgYWNjb3VudCB0byB0cmFuc2ZlciB0aGUgYWRtaW4gcHJpdmlsZWdlcyB0by4KKiBgbGl2ZV91bnRpbF9sZWRnZXJgIC0gVGhlIGxlZGdlciBudW1iZXIgYXQgd2hpY2ggdGhlIHBlbmRpbmcgdHJhbnNmZXIKZXhwaXJlcy4gSWYgYGxpdmVfdW50aWxfbGVkZ2VyYCBpcyBgMGAsIHRoZSBwZW5kaW5nIHRyYW5zZmVyIGlzCmNhbmNlbGxlZC4gYGxpdmVfdW50aWxfbGVkZ2VyYCBhcmd1bWVudCBpcyBpbXBsaWNpdGx5IGJvdW5kZWQgYnkgdGhlCm1heGltdW0gYWxsb3dlZCBUVEwgZXh0ZW5zaW9uIGZvciBhIHRlbXBvcmFyeSBzdG9yYWdlIGVudHJ5IGFuZApzcGVjaWZ5aW5nIGEgaGlnaGVyIHZhbHVlIHdpbGwgY2F1c2UgdGhlIGNvZGUgdG8gcGFuaWMuCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRyeWluZyB0byBjYW5jZWwgYSB0cmFuc2ZlciB0aGF0IGRvZXNuJ3QgZXhpc3QuCiogW2BjcmF0ZTo6cm9sZV90cmFuc2Zlcjo6Um9sZVRyYW5zZmVyRXJyb3I6OkludmFsaWRMaXZlVW50aWxMZWRnZXJgXSAtCklmIHRoZSBzcGVjaWZpZWQgbGVkZ2VyIGlzIGluIHRoZSBwYXN0LgoqIFtgY3JhdGU6OnJvbGVfdHJhbnNmZXI6OlJvbGVUcmFuc2ZlckVycm9yOjpJbnZhbGlkUGVuZGluZ0FjY291bnRgXSAtCklmIHRoZSBzcGVjaWZpZWQgcGVuZGluZyBhY2NvdW50IGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgcHJvdmlkZWQgYG5ld2AKYWRkcmVzcy4KAAAAE3RyYW5zZmVyX2FkbWluX3JvbGUAAAAAAgAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAA==",
        "AAAAAAAAAYVDb21wbGV0ZXMgdGhlIDItc3RlcCBhZG1pbiB0cmFuc2Zlci4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byBTb3JvYmFuIGVudmlyb25tZW50LgoKIyBFdmVudHMKCiogdG9waWNzIC0gYFsiYWRtaW5fdHJhbnNmZXJfY29tcGxldGVkIiwgbmV3X2FkbWluOiBBZGRyZXNzXWAKKiBkYXRhIC0gYFtwcmV2aW91c19hZG1pbjogQWRkcmVzc11gCgojIEVycm9ycwoKKiBbYGNyYXRlOjpyb2xlX3RyYW5zZmVyOjpSb2xlVHJhbnNmZXJFcnJvcjo6Tm9QZW5kaW5nVHJhbnNmZXJgXSAtIElmCnRoZXJlIGlzIG5vIHBlbmRpbmcgdHJhbnNmZXIgdG8gYWNjZXB0LgoqIFtgQWNjZXNzQ29udHJvbEVycm9yOjpBZG1pbk5vdFNldGBdIC0gSWYgYWRtaW4gYWNjb3VudCBpcyBub3Qgc2V0LgAAAAAAABVhY2NlcHRfYWRtaW5fdHJhbnNmZXIAAAAAAAAAAAAAAA==",
        "AAAAAAAAAMhSZXR1cm5zIHRoZSB0b3RhbCBudW1iZXIgb2YgYWNjb3VudHMgdGhhdCBoYXZlIHRoZSBzcGVjaWZpZWQgcm9sZS4KSWYgdGhlIHJvbGUgZG9lcyBub3QgZXhpc3QsIHJldHVybnMgMC4KCiMgQXJndW1lbnRzCgoqIGBlYCAtIEFjY2VzcyB0byBTb3JvYmFuIGVudmlyb25tZW50LgoqIGByb2xlYCAtIFRoZSByb2xlIHRvIGdldCB0aGUgY291bnQgZm9yLgAAABVnZXRfcm9sZV9tZW1iZXJfY291bnQAAAAAAAABAAAAAAAAAARyb2xlAAAAEQAAAAEAAAAE",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIGdyYW50ZWQuAAAAAAAAAAAAAAtSb2xlR3JhbnRlZAAAAAABAAAADHJvbGVfZ3JhbnRlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAACVFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGlzIHJldm9rZWQuAAAAAAAAAAAAAAtSb2xlUmV2b2tlZAAAAAABAAAADHJvbGVfcmV2b2tlZAAAAAMAAAAAAAAABHJvbGUAAAARAAAAAQAAAAAAAAAHYWNjb3VudAAAAAATAAAAAQAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAC9FdmVudCBlbWl0dGVkIHdoZW4gdGhlIGFkbWluIHJvbGUgaXMgcmVub3VuY2VkLgAAAAAAAAAADkFkbWluUmVub3VuY2VkAAAAAAABAAAAD2FkbWluX3Jlbm91bmNlZAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAg==",
        "AAAABQAAACtFdmVudCBlbWl0dGVkIHdoZW4gYSByb2xlIGFkbWluIGlzIGNoYW5nZWQuAAAAAAAAAAAQUm9sZUFkbWluQ2hhbmdlZAAAAAEAAAAScm9sZV9hZG1pbl9jaGFuZ2VkAAAAAAADAAAAAAAAAARyb2xlAAAAEQAAAAEAAAAAAAAAE3ByZXZpb3VzX2FkbWluX3JvbGUAAAAAEQAAAAAAAAAAAAAADm5ld19hZG1pbl9yb2xlAAAAAAARAAAAAAAAAAI=",
        "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgY29tcGxldGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVyQ29tcGxldGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2NvbXBsZXRlZAAAAAIAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAABAAAAAAAAAA5wcmV2aW91c19hZG1pbgAAAAAAEwAAAAAAAAAC",
        "AAAABQAAADJFdmVudCBlbWl0dGVkIHdoZW4gYW4gYWRtaW4gdHJhbnNmZXIgaXMgaW5pdGlhdGVkLgAAAAAAAAAAABZBZG1pblRyYW5zZmVySW5pdGlhdGVkAAAAAAABAAAAGGFkbWluX3RyYW5zZmVyX2luaXRpYXRlZAAAAAMAAAAAAAAADWN1cnJlbnRfYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAAAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAAAAAAC" ]),
      options
    )
  }
  public readonly fromJSON = {
    has_role: this.txFromJSON<Option<u32>>,
        get_admin: this.txFromJSON<Option<string>>,
        get_quote: this.txFromJSON<Option<Quote>>,
        is_active: this.txFromJSON<boolean>,
        grant_role: this.txFromJSON<null>,
        lock_quote: this.txFromJSON<Result<u32>>,
        revoke_role: this.txFromJSON<null>,
        consume_quote: this.txFromJSON<Result<void>>,
        renounce_role: this.txFromJSON<null>,
        get_role_admin: this.txFromJSON<Option<string>>,
        renounce_admin: this.txFromJSON<null>,
        set_role_admin: this.txFromJSON<null>,
        get_role_member: this.txFromJSON<string>,
        get_existing_roles: this.txFromJSON<Array<string>>,
        transfer_admin_role: this.txFromJSON<null>,
        accept_admin_transfer: this.txFromJSON<null>,
        get_role_member_count: this.txFromJSON<u32>
  }
}