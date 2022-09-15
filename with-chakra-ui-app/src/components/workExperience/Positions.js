import {
    Flex,
    Heading,
    Box
} from '@chakra-ui/react'

const Positions = ({content}) => {

    const pad = "1em"

    return (

        <Flex width="40vw" align="left" direction="column" marginRight="5em" >
            <Heading size="2xl">{content.company}</Heading>
            <Box paddingTop={pad} fontStyle="italic">{content.title}</Box>
            <Box paddingTop={pad}>{content.description}</Box>
        </Flex>
    )

}

export default Positions