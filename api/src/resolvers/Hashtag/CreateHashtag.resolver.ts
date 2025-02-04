import { Arg, Ctx, Mutation, Resolver, UseMiddleware } from "type-graphql";
import ContextType from "~/types/Context.type";
import executeOrFail from "~/util/executeOrFail";
import { User } from "@prisma/client";
import { isAuthenticated } from "~/middleware/isAuthenticated.middleware";
import { Hashtag } from "src/typegql-generated";
import { CreateHashtagArgs } from "./args/CreateHashtagArgs";

@Resolver()
export default class CreateHashtagResolver {
  @Mutation(() => Hashtag)
  @UseMiddleware(isAuthenticated)
  async createHashtag(
    @Arg("args") args: CreateHashtagArgs,
    @Ctx() { req, prisma }: ContextType
  ): Promise<Hashtag> {
    // retrieve the currently logged in user
    const user: User = (req as any).user;

    return executeOrFail(async () => {
      const hashtag = await prisma.hashtag.create({
        data: {
          name: args.name,
          creator: { connect: { id: user.id } },
          numOfPosts: 0,
        },
      });

      return hashtag;
    });
  }
}
