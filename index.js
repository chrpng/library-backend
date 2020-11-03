const { ApolloServer, gql, UserInputError, AuthenticationError } = require('apollo-server')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')

const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')

const config = require('./utils/config')
const logger = require('./utils/logger')
// const { books, authors } = require('./utils/init')

mongoose.connect(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
	.then(() => {
		console.log('connected to MongoDB')
	})
	.catch((error) => {
		console.log('error connecting to MongoDB: ', error.message)
	})

const typeDefs = gql`
	type Book {
		title: String!
		published: Int!
		author: Author!
		genres: [String!]!
		id: ID!
	}

	type Author {
		name: String!
		born: Int
		bookCount: Int!
		id: ID!
	}

	type User {
		username: String!
		favoriteGenre: String!
		id: ID!
	}

	type Token {
		value: String!
	}

  type Query {
		bookCount: Int!
		authorCount: Int!
		allBooks(author: String, genre: String): [Book!]!
		allAuthors: [Author!]!
		me: User
	}
	
	type Mutation {
		addBook(
			title: String!
			author: String!
			published: Int!
			genres: [String!]!
		): Book
		editAuthor(
			name: String!
			setBornTo: Int!
		): Author
		createUser(
			username: String!
			favoriteGenre: String!
		): User
		login(
			username: String!
			password: String!
		): Token
	}
`

const resolvers = {
  Query: {
		bookCount: () => Book.collection.countDocuments(),
		authorCount: () => Author.collection.countDocuments(),
		allBooks: (root, args) => {
			if (!args.author && !args.genre) return Book.find({}).populate('author')

			return Book
				.find(args.genre ? { genres : args.genre } : {})
				.populate({
					"path": "author",
					"match": args.author && { "name": args.author }
				})
				.then(books => {
					return books.filter(book => book.author)
				})
		},
		allAuthors: () => Author.find({}),
		me: (root, args, context) => {
			return context.currentUser
		}
	},
	Mutation: {
		addBook: async (root, args, { currentUser }) => {
			if(!currentUser) throw new AuthenticationError("not authenticated")

			let author = await Author.findOne({ name: args.author })

			if (!author) {
				author = new Author({
					name: args.author
				})

				try {
					await author.save()
				} catch (error) {
					throw new UserInputError(error.message, {
						invalidArgs: args
					})
				}
			}

			const book = new Book({ ...args, author })
			try {
				await book.save()
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args
				})
			}

			return book
		},
		editAuthor: async (root, args, { currentUser }) => {
			if(!currentUser) throw new AuthenticationError("not authenticated")

			const author = await Author.findOne({ name: args.name })

			author.born = args.setBornTo
			try {
				await author.save()
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args
				})
			}

			return author
		},
		createUser: async (root, args) => {
			const user = new User({
				username: args.username,
				favoriteGenre: args.favoriteGenre
			})
			
			try {
				await user.save()
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args,
				})
			}

			return user
		},
		login: async (root, args) => {
			const user = await User.findOne({ username: args.username})

			if (!user || args.password !== 'secret') {
				throw new UserInputError('Wrong credentials')
			}

			const userForToken = {
				username: user.username,
				id: user._id
			}

			return { value: jwt.sign(userForToken, config.JWT_SECRET) }
		}
	},
	Author: {
		bookCount: (root) => Book.find({ author: root.id }).countDocuments()
	}
}

const server = new ApolloServer({
  typeDefs,
	resolvers,
	context: async ({ req }) => {
		const auth = req ? req.headers.authorization : null
		if (auth && auth.toLowerCase().startsWith('bearer ')) {
			const decodedToken = jwt.verify(
				auth.substring(7), config.JWT_SECRET
			)

			const currentUser = await User.findById(decodedToken.id)
			return { currentUser }
		}
	}
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})