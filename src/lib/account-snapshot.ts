export type AccountSnapshot =
  | { status: "unconfigured" }
  | { status: "error"; message: string }
  | { status: "signed-out" }
  | {
      status: "signed-in"
      email: string
      fullName: string
      profileWritable: boolean
      profileMessage: string | null
      deletionAvailable: boolean
    }
